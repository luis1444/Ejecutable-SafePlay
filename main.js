// main.js
const { app, BrowserWindow, ipcMain, Tray, Menu, screen } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs'); // 👈 NUEVO
const AuthService = require('./authService');

/* ==================== PARCHE CACHE CHROMIUM (evita errores de "Unable to create cache") ==================== */
// Dir de userData/cache controlado por nosotros (con permisos de escritura)
const isWin = process.platform === 'win32';
const userDataPath = isWin
    ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'SafePlay')
    : path.join(os.homedir(), '.safeplay');

try { fs.mkdirSync(userDataPath, { recursive: true }); } catch {}
try { fs.mkdirSync(path.join(userDataPath, 'Cache'), { recursive: true }); } catch {}

app.setPath('userData', userDataPath);
app.setPath('cache', path.join(userDataPath, 'Cache'));

// Opcional: apagar caches de red y shader en disco
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disk-cache-size', '0');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
/* ============================================================================================================ */

let mainWindow;
let overlayWindow;
let tray;
let gameTimes = {};   // { gameName: { start: timestamp } }

// Timers por juego: playTimers[gameName] = { kill: Timeout, warn: Timeout }
let playTimers = {};

// Anti-dup de overlays
let lastOverlayKey = '';
let lastOverlayTs = 0;

// --- Config de polling ---
const BASE_POLL_MS   = 1000;
const BURST_MS       = 10000;
const BURST_INTERVAL = 500;

let baseIntervalId = null;
let burstIntervalId = null;
let burstUntil = 0;

const recentlyKilled = new Map();   // { gameName: timestamp }
const KILLED_GRACE_MS = 3000;

// NUEVO: recuerda “starts” recientes para no spamear overlays
const recentlyStarted = new Map();  // { gameName: timestamp }
const START_OVERLAY_COOLDOWN_MS = 5000;

// ============ Funciones Aux ============

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

        // Detectar nuevos + registrar
        games.forEach(gameName => {
            if (!gameTimes[gameName]) {
                gameTimes[gameName] = { start: now };
                // Overlay “Juego iniciado” con cooldown anti-spam
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
                }
                newGames.push(gameName);
            }
        });

        // Enviar lista
        const gamesWithStart = games.map(gameName => ({
            name: gameName,
            start: gameTimes[gameName]?.start || 0
        }));
        mainWindow.webContents.send('update-game-list', gamesWithStart);

        // Detectar cerrados
        const runningSet = new Set(games);
        let anyClosed = false;

        Object.keys(gameTimes).forEach(trackedGame => {
            if (!runningSet.has(trackedGame)) {
                const killedAt = recentlyKilled.get(trackedGame);
                if (killedAt && (Date.now() - killedAt) < KILLED_GRACE_MS) {
                    clearGameTimers(trackedGame);
                    delete gameTimes[trackedGame];
                    anyClosed = true;
                    return;
                }
                // Cierre manual
                handleUserClosedGame(trackedGame);
                anyClosed = true;
            }
        });

        // Limpieza de marcas
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
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 980,
        height: 700,
        icon: path.join(__dirname, 'assets', 'icon.png'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    AuthService.getSession().then(sess => {
        if (sess) mainWindow.loadFile('index.html');
        else mainWindow.loadFile('login.html');
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
        { label: 'Salir', click: () => app.quit() }
    ]);
    tray.setToolTip('SafePlay App');
    tray.setContextMenu(contextMenu);
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



// === IPC AUTH ===
ipcMain.handle('auth:login', async (_evt, { email, password }) => {
    try {
        const { token, user } = await AuthService.login({ email, password });
        return { ok: true, user };
    } catch (err) {
        return { ok: false, message: err?.message || 'Error de autenticación' };
    }
});

ipcMain.handle('auth:getSession', async () => {
    const sess = await AuthService.getSession();
    return { ok: !!sess, session: sess || null };
});

ipcMain.handle('auth:logout', async () => {
    await AuthService.logout();
    return { ok: true };
});

// Overlay hover toggle
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

// === IPC Juegos ===
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
            try {
                showOverlay({
                    variant: 'warn',
                    title: 'Aviso: cierre inminente',
                    body: `El juego <b>${gameName}</b> se cerrará en <b>30 segundos</b> por límite de tiempo.`,
                    duration: 30000,
                    countdownMs: 30000
                });
            } catch (_) {}
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

app.whenReady().then(() => {
    createWindow();
    createOverlayWindow();
    createTray();

    baseIntervalId = setInterval(scanGames, BASE_POLL_MS);
});

app.on('browser-window-blur', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        try { overlayWindow.setAlwaysOnTop(true, 'screen-saver'); } catch (_) {}
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
        createOverlayWindow();
    }
});
