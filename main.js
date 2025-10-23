// main.js (VERSIÓN PROTEGIDA - con sistema de polling integrado)
const { app, BrowserWindow, ipcMain, Tray, Menu, screen, dialog } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const AuthService = require('./authService');
const ApiService = require('./apiService');
const CommandExecutor = require('./commandExecutor');
const ProcessProtector = require('./processProtector');

/* ==================== CONFIGURACIÓN DE SEGURIDAD ==================== */
// Protección contra cierre
let allowClose = false;
let isPasswordDialogOpen = false;

/* ==================== PARCHE CACHE CHROMIUM ==================== */
const isWin = process.platform === 'win32';
const userDataPath = isWin
    ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'SafePlay')
    : path.join(os.homedir(), '.safeplay');

try { fs.mkdirSync(userDataPath, { recursive: true }); } catch {}
try { fs.mkdirSync(path.join(userDataPath, 'Cache'), { recursive: true }); } catch {}

app.setPath('userData', userDataPath);
app.setPath('cache', path.join(userDataPath, 'Cache'));
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disk-cache-size', '0');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

// 🔒 OCULTAR PROCESO DEL ADMINISTRADOR DE TAREAS
if (isWin) {
    app.commandLine.appendSwitch('disable-renderer-backgrounding');
}

/* ==================== VARIABLES GLOBALES ==================== */
let mainWindow;
let overlayWindow;
let tray;
let gameTimes = {};
let playTimers = {};

// Polling de juegos
const BASE_POLL_MS = 1000;
const BURST_MS = 10000;
const BURST_INTERVAL = 500;
let baseIntervalId = null;
let burstIntervalId = null;
let burstUntil = 0;

// Polling de comandos remotos
const COMMAND_POLL_INTERVAL = 5000;
let commandPollIntervalId = null;
let commandExecutor = null;

// Anti-duplicación
const recentlyKilled = new Map();
const KILLED_GRACE_MS = 3000;
const recentlyStarted = new Map();
const START_OVERLAY_COOLDOWN_MS = 5000;
let lastOverlayKey = '';
let lastOverlayTs = 0;

// Cola de logs para enviar en batch
let activityLogQueue = [];
const ACTIVITY_LOG_BATCH_SIZE = 10;
const ACTIVITY_LOG_BATCH_INTERVAL = 30000;
let activityLogBatchIntervalId = null;

/* ==================== FUNCIONES DE SEGURIDAD ==================== */

// Verificar contraseña del usuario
async function verifyPassword(password) {
    try {
        const session = await AuthService.getSession();
        if (!session?.user?.email) {
            return false;
        }

        // Intentar login con las credenciales actuales
        const result = await AuthService.verifyCredentials(session.user.email, password);
        return result;
    } catch (error) {
        console.error('[Security] Error verificando contraseña:', error);
        return false;
    }
}

// Mostrar diálogo de contraseña antes de cerrar
async function showPasswordDialog(action = 'cerrar la aplicación') {
    if (isPasswordDialogOpen) return false;

    isPasswordDialogOpen = true;

    return new Promise((resolve) => {
        if (!mainWindow || mainWindow.isDestroyed()) {
            isPasswordDialogOpen = false;
            resolve(false);
            return;
        }

        mainWindow.webContents.send('show-password-dialog', { action });

        // Escuchar respuesta del renderer
        const handler = async (_event, password) => {
            ipcMain.removeListener('password-dialog-response', handler);
            isPasswordDialogOpen = false;

            if (!password) {
                resolve(false);
                return;
            }

            const isValid = await verifyPassword(password);

            if (!isValid) {
                dialog.showMessageBoxSync(mainWindow, {
                    type: 'error',
                    title: 'Contraseña incorrecta',
                    message: 'La contraseña ingresada es incorrecta.',
                    buttons: ['OK']
                });
                resolve(false);
            } else {
                resolve(true);
            }
        };

        ipcMain.on('password-dialog-response', handler);
    });
}

// Proteger contra cierre del proceso
function protectProcess() {
    if (!isWin) return;

    // Reiniciar el proceso si se cierra inesperadamente
    const processName = path.basename(process.execPath);

    setInterval(() => {
        exec(`tasklist /FI "IMAGENAME eq ${processName}"`, (err, stdout) => {
            if (err || !stdout.includes(processName)) {
                console.log('[Security] Proceso terminado, reiniciando...');
                app.relaunch();
            }
        });
    }, 5000);
}

// Reintentar creación de ventana si se cierra
function ensureWindowExists() {
    setInterval(() => {
        if (!mainWindow || mainWindow.isDestroyed()) {
            console.log('[Security] Ventana destruida, recreando...');
            createWindow();
        }
    }, 2000);
}

/* ==================== FUNCIONES AUXILIARES DE LOGS ==================== */

function queueActivityLog(gameName, action, duration = null, details = {}) {
    activityLogQueue.push({
        gameName,
        action,
        duration,
        details,
        timestamp: new Date()
    });

    if (activityLogQueue.length >= ACTIVITY_LOG_BATCH_SIZE) {
        flushActivityLogs();
    }
}

async function flushActivityLogs() {
    if (activityLogQueue.length === 0) return;

    const logsToSend = [...activityLogQueue];
    activityLogQueue = [];

    try {
        await ApiService.logActivitiesBatch(logsToSend);
        console.log(`[Activity] ${logsToSend.length} logs enviados al servidor`);
    } catch (error) {
        console.error('[Activity] Error enviando logs:', error);
        activityLogQueue = [...logsToSend, ...activityLogQueue];
    }
}

/* ==================== FUNCIONES DE POLLING DE COMANDOS ==================== */

async function pollCommands() {
    const session = await AuthService.getSession();
    if (!session?.token) {
        console.log('[CommandPoll] No hay sesión activa');
        return;
    }

    try {
        const commands = await ApiService.fetchPendingCommands();

        if (commands.length > 0) {
            console.log(`[CommandPoll] ${commands.length} comando(s) pendiente(s)`);

            for (const command of commands) {
                if (commandExecutor) {
                    await commandExecutor.executeCommand(command);
                }
            }
        }
    } catch (error) {
        console.error('[CommandPoll] Error consultando comandos:', error.message);
    }
}

function startCommandPolling() {
    if (commandPollIntervalId) return;

    console.log('[CommandPoll] Iniciando polling de comandos...');
    commandPollIntervalId = setInterval(pollCommands, COMMAND_POLL_INTERVAL);
    pollCommands();
}

function stopCommandPolling() {
    if (commandPollIntervalId) {
        clearInterval(commandPollIntervalId);
        commandPollIntervalId = null;
        console.log('[CommandPoll] Polling de comandos detenido');
    }
}

/* ==================== FUNCIONES DE JUEGOS ==================== */

function startBurstPoll(ms = BURST_MS, every = BURST_INTERVAL) {
    const now = Date.now();
    burstUntil = Math.max(burstUntil, now + ms);
    if (burstIntervalId) return;

    burstIntervalId = setInterval(() => {
        const t = Date.now();
        scanGames();
        if (t >= burstUntil) {
            clearInterval(burstIntervalId);
            burstIntervalId = null;
        }
    }, every);
}

function getRunningGames() {
    return new Promise((resolve, reject) => {
        const platform = os.platform();
        let command = '';

        if (platform === 'win32') {
            command = 'powershell "Get-Process | Select-Object ProcessName,Path"';
        } else {
            command = 'ps aux';
        }

        exec(command, { encoding: 'utf8', maxBuffer: 1024 * 500 }, (error, stdout, stderr) => {
            if (error) {
                reject(`Error al obtener procesos: ${stderr}`);
                return;
            }

            let games = [];

            if (platform === 'win32') {
                const lines = stdout.split('\n').slice(3);
                for (let line of lines) {
                    if (!line.trim()) continue;
                    const parts = line.trim().split(/\s{2,}/).filter(Boolean);
                    if (parts.length < 2) continue;

                    const exeName = parts[0];
                    const exePath = parts[1];

                    if (exePath && exePath.toLowerCase().includes('steamapps\\common')) {
                        games.push({
                            name: exeName.replace('.exe', ''),
                            path: exePath
                        });
                    }
                }

                const uniqueGames = {};
                games.forEach(game => {
                    const folder = path.dirname(game.path);
                    if (!uniqueGames[folder]) uniqueGames[folder] = game.name;
                });
                games = Object.values(uniqueGames);
            } else {
                const lines = stdout.split('\n').slice(1);
                lines.forEach(line => {
                    if (!line.trim()) return;
                    const parts = line.trim().split(/\s+/);
                    const command = parts[parts.length - 1];
                    if (command.toLowerCase().includes('steamapps')) {
                        const processName = command.split('/').pop();
                        games.push(processName.replace('.exe', ''));
                    }
                });
            }

            resolve(games);
        });
    });
}

async function scanGames() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const url = mainWindow.webContents.getURL();
    if (!url.endsWith('/index.html')) return;

    try {
        const games = await getRunningGames();
        const now = Date.now();
        const newGames = [];

        games.forEach(gameName => {
            if (!gameTimes[gameName]) {
                gameTimes[gameName] = { start: now };

                const lastStart = recentlyStarted.get(gameName) || 0;
                if (now - lastStart > START_OVERLAY_COOLDOWN_MS) {
                    recentlyStarted.set(gameName, now);
                    showOverlay({
                        variant: 'success',
                        title: 'Juego iniciado',
                        body: `Se inició <b>${gameName}</b>.`,
                        duration: 3500
                    });
                    startBurstPoll(4000, 400);

                    queueActivityLog(gameName, 'started', null, {
                        timestamp: new Date()
                    });
                }
                newGames.push(gameName);
            }
        });

        const gamesWithStart = games.map(gameName => ({
            name: gameName,
            start: gameTimes[gameName]?.start || 0
        }));
        mainWindow.webContents.send('update-game-list', gamesWithStart);

        const runningSet = new Set(games);
        let anyClosed = false;

        Object.keys(gameTimes).forEach(trackedGame => {
            if (!runningSet.has(trackedGame)) {
                const killedAt = recentlyKilled.get(trackedGame);
                if (killedAt && (Date.now() - killedAt) < KILLED_GRACE_MS) {
                    clearGameTimers(trackedGame);
                    delete gameTimes[trackedGame];
                    anyClosed = true;

                    queueActivityLog(trackedGame, 'closed', null, {
                        reason: 'Killed by system'
                    });
                    return;
                }

                handleUserClosedGame(trackedGame);
                anyClosed = true;
            }
        });

        for (const [name, ts] of recentlyKilled) {
            if ((Date.now() - ts) > (KILLED_GRACE_MS * 3)) {
                recentlyKilled.delete(name);
            }
        }
        for (const [name, ts] of recentlyStarted) {
            if ((Date.now() - ts) > 60000) {
                recentlyStarted.delete(name);
            }
        }

        if (anyClosed || newGames.length) startBurstPoll(4000, 400);

    } catch (_) {}
}

function handleUserClosedGame(gameName) {
    clearGameTimers(gameName);
    delete gameTimes[gameName];

    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('game-closed-manual', gameName);
    }

    showOverlay({
        variant: 'info',
        title: 'Juego cerrado',
        body: `El usuario cerró <b>${gameName}</b> manualmente.`,
        duration: 5000
    });

    queueActivityLog(gameName, 'closed', null, {
        reason: 'User closed manually'
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 980,
        height: 700,
        icon: path.join(__dirname, 'assets', 'icon.png'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        // 🔒 Deshabilitar cierre por botón X
        closable: false
    });

    // 🔒 Interceptar intento de cierre
    mainWindow.on('close', async (event) => {
        if (!allowClose) {
            event.preventDefault();

            const canClose = await showPasswordDialog('cerrar la aplicación');

            if (canClose) {
                allowClose = true;
                stopCommandPolling();
                flushActivityLogs();
                app.quit();
            }
        }
    });

    AuthService.getSession().then(sess => {
        if (sess) {
            mainWindow.loadFile('index.html');
            startCommandPolling();
        } else {
            mainWindow.loadFile('login.html');
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function createOverlayWindow() {
    if (overlayWindow && !overlayWindow.isDestroyed()) return;

    overlayWindow = new BrowserWindow({
        width: 800,
        height: 600,
        frame: false,
        transparent: true,
        resizable: false,
        movable: false,
        show: false,
        focusable: false,
        skipTaskbar: true,
        hasShadow: false,
        backgroundColor: '#00000000',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    overlayWindow.fullScreenable = false;

    try {
        overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    } catch (_) {}

    overlayWindow.loadFile('overlay.html').catch(() => {});

    overlayWindow.on('closed', () => {
        overlayWindow = null;
    });
}

function createTray() {
    tray = new Tray(path.join(__dirname, 'assets', 'tray-icon.png'));
    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Abrir SafePlay',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                }
            }
        },
        {
            label: 'Salir',
            click: async () => {
                const canClose = await showPasswordDialog('cerrar la aplicación');
                if (canClose) {
                    allowClose = true;
                    stopCommandPolling();
                    flushActivityLogs();
                    app.quit();
                }
            }
        }
    ]);
    tray.setToolTip('SafePlay App - Protección Activa');
    tray.setContextMenu(contextMenu);

    // Restaurar ventana al hacer clic en el tray
    tray.on('click', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

function safeOverlayBounds() {
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    overlayWindow.setBounds({ x: 0, y: 0, width, height });
}

function clearOverlay() {
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    try {
        overlayWindow.webContents.send('overlay:clear');
    } catch (_) {}
}

function showOverlay(payload) {
    const key = `${payload?.variant || ''}|${payload?.title || ''}|${payload?.body || ''}`;
    const now = Date.now();
    if (key === lastOverlayKey && now - lastOverlayTs < 1000) return;
    lastOverlayKey = key;
    lastOverlayTs = now;

    createOverlayWindow();
    if (!overlayWindow || overlayWindow.isDestroyed()) return;

    clearOverlay();
    safeOverlayBounds();

    if (!overlayWindow.isVisible()) {
        try { overlayWindow.showInactive(); } catch (_) {}
    }
    try {
        overlayWindow.webContents.send('overlay:show', payload);
    } catch (_) {}
}

function killGame(gameName) {
    const platform = os.platform();
    let command = platform === 'win32'
        ? `taskkill /IM "${gameName}.exe" /F`
        : `pkill -f ${gameName}`;

    exec(command, (error) => {
        if (error) {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('game-blocked', {
                    name: gameName,
                    success: false,
                    message: `❌ No se pudo cerrar ${gameName}.`
                });
            }
            showOverlay({
                variant: 'error',
                title: 'No se pudo cerrar el juego',
                body: `Intento fallido al cerrar <b>${gameName}</b>.`,
                duration: 5000
            });
        } else {
            recentlyKilled.set(gameName, Date.now());
            clearGameTimers(gameName);
            startBurstPoll(4000, 400);

            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('game-blocked', {
                    name: gameName,
                    success: true,
                    message: `✅ Juego cerrado: ${gameName}`
                });
            }
            showOverlay({
                variant: 'success',
                title: 'Juego cerrado',
                body: `Se cerró <b>${gameName}</b> por límite o bloqueo.`,
                duration: 4500
            });
        }
    });
}

function clearGameTimers(gameName) {
    const t = playTimers[gameName];
    if (!t) return;
    try { if (t.kill) clearTimeout(t.kill); } catch(_) {}
    try { if (t.warn) clearTimeout(t.warn); } catch(_) {}
    delete playTimers[gameName];
}

/* ==================== IPC AUTH ==================== */

ipcMain.handle('auth:login', async (_evt, { email, password }) => {
    try {
        const { token, user } = await AuthService.login({ email, password });
        startCommandPolling();
        return { ok: true, user };
    } catch (err) {
        return { ok: false, message: err?.message || 'Error de autenticación' };
    }
});

ipcMain.handle('auth:getSession', async () => {
    const sess = await AuthService.getSession();
    if (sess) {
        startCommandPolling();
    }
    return { ok: !!sess, session: sess || null };
});

ipcMain.handle('auth:logout', async () => {
    // 🔒 Requiere contraseña para cerrar sesión
    const canLogout = await showPasswordDialog('cerrar sesión');

    if (!canLogout) {
        return { ok: false, message: 'Cierre de sesión cancelado' };
    }

    stopCommandPolling();
    flushActivityLogs();
    await AuthService.logout();
    return { ok: true };
});

ipcMain.on('overlay:hover', (_evt, isHovering) => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return;
    try {
        overlayWindow.setIgnoreMouseEvents(!isHovering, { forward: true });
    } catch (_) {}
});

ipcMain.handle('overlay:show', (_evt, payload) => {
    showOverlay(payload || {});
    return { ok: true };
});

ipcMain.handle('overlay:clear', () => {
    clearOverlay();
    return { ok: true };
});

/* ==================== IPC JUEGOS ==================== */

ipcMain.on('block-game', (_event, gameName) => {
    clearGameTimers(gameName);
    delete gameTimes[gameName];
    killGame(gameName);
});

ipcMain.on("set-playtime", (_event, { gameName, minutes }) => {
    clearGameTimers(gameName);
    gameTimes[gameName] = { start: Date.now() };

    const totalMs = minutes * 60 * 1000;
    const warnOffset = 30 * 1000;

    if (totalMs > warnOffset) {
        const warnTimer = setTimeout(() => {
            showOverlay({
                variant: 'warn',
                title: 'Aviso: cierre inminente',
                body: `El juego <b>${gameName}</b> se cerrará en <b>30 segundos</b> por límite de tiempo.`,
                duration: 30000,
                countdownMs: 30000
            });
        }, totalMs - warnOffset);

        playTimers[gameName] = { ...(playTimers[gameName] || {}), warn: warnTimer };
    }

    const killTimer = setTimeout(() => {
        try {
            killGame(gameName);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send("time-up", gameName);
            }
            showOverlay({
                variant: 'warn',
                title: 'Tiempo de juego agotado',
                body: `El tiempo de <b>${gameName}</b> se ha cumplido. El juego fue cerrado.`,
                duration: 6000
            });

            queueActivityLog(gameName, 'closed', minutes * 60, {
                reason: 'Time limit reached'
            });
        } catch (_) {}
        finally {
            clearGameTimers(gameName);
        }
    }, totalMs);

    playTimers[gameName] = { ...(playTimers[gameName] || {}), kill: killTimer };

    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("playtime-set", { gameName, minutes });
    }

    showOverlay({
        variant: 'info',
        title: 'Tiempo establecido',
        body: `Se establecieron <b>${minutes} min</b> para <b>${gameName}</b>.`,
        duration: 4000
    });

    startBurstPoll(8000, 500);
});

ipcMain.on('game-unblocked', (_event, gameName) => {
    gameTimes[gameName] = { start: Date.now() };
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('game-unblocked', gameName);
    }
    showOverlay({
        variant: 'success',
        title: 'Juego desbloqueado',
        body: `Se ha desbloqueado <b>${gameName}</b>.`,
        duration: 3500
    });
});

ipcMain.on('clear-game-timers', (_event, gameName) => {
    clearGameTimers(gameName);
    delete gameTimes[gameName];
});

/* ==================== APP LIFECYCLE ==================== */

app.whenReady().then(() => {
    createWindow();
    createOverlayWindow();
    createTray();

    baseIntervalId = setInterval(scanGames, BASE_POLL_MS);
    activityLogBatchIntervalId = setInterval(flushActivityLogs, ACTIVITY_LOG_BATCH_INTERVAL);

    // 🔒 Activar protecciones
    protectProcess();
    ensureWindowExists();
});

app.on('browser-window-blur', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        try { overlayWindow.setAlwaysOnTop(true, 'screen-saver'); } catch (_) {}
    }
});

// 🔒 Prevenir cierre completo de la app
app.on('window-all-closed', (event) => {
    event.preventDefault();
    // No hacer nada - mantener la app ejecutándose
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
        createOverlayWindow();
    }
});

app.on('before-quit', async (event) => {
    if (!allowClose) {
        event.preventDefault();
    } else {
        flushActivityLogs();
        stopCommandPolling();
    }
});

// Inicializar CommandExecutor
setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        commandExecutor = new CommandExecutor(
            mainWindow,
            killGame.bind(this),
            (gameName, minutes) => {
                ipcMain.emit('set-playtime', null, { gameName, minutes });
            },
            showOverlay.bind(this)
        );
        console.log('[Main] CommandExecutor inicializado');
    }
}, 1500);