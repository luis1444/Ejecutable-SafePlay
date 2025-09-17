const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const os = require('os');

let mainWindow;
let tray;
let gameTimes = {};   // { gameName: { start: timestamp } }
let playTimers = {};  // { gameName: timeoutId }

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
                    if (!uniqueGames[folder]) {
                        uniqueGames[folder] = game.name;
                    }
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

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        icon: path.join(__dirname, 'assets', 'icon.png'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.loadFile('index.html');
}

function createTray() {
    tray = new Tray(path.join(__dirname, 'assets', 'tray-icon.png'));
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Salir', click: () => app.quit() }
    ]);
    tray.setToolTip('SafePlay App');
    tray.setContextMenu(contextMenu);
}

function killGame(gameName) {
    const platform = os.platform();
    let command = platform === 'win32'
        ? `taskkill /IM "${gameName}.exe" /F`
        : `pkill -f ${gameName}`;

    exec(command, (error) => {
        if (error) {
            mainWindow.webContents.send('game-blocked', {
                name: gameName,
                success: false,
                message: `❌ No se pudo cerrar ${gameName}.`
            });
        } else {
            mainWindow.webContents.send('game-blocked', {
                name: gameName,
                success: true,
                message: `✅ Juego cerrado: ${gameName}`
            });
        }
    });
}

ipcMain.on('block-game', (event, gameName) => {
    // Detener el temporizador cuando el juego se bloquea
    if (playTimers[gameName]) {
        clearTimeout(playTimers[gameName]);
        delete playTimers[gameName];
    }
    // Eliminar el juego de gameTimes cuando se bloquea
    delete gameTimes[gameName];
    killGame(gameName);
});

ipcMain.on("set-playtime", (event, { gameName, minutes }) => {
    // Detener el temporizador anterior si existe
    if (playTimers[gameName]) {
        clearTimeout(playTimers[gameName]);
        delete playTimers[gameName];
    }

    // Reiniciar el tiempo del juego a la hora actual (esto reinicia el contador)
    gameTimes[gameName] = { start: Date.now() };

    // Establecer un nuevo temporizador para el juego
    playTimers[gameName] = setTimeout(() => {
        killGame(gameName);  // Bloquear el juego cuando termine el tiempo
        mainWindow.webContents.send("time-up", gameName);
    }, minutes * 60 * 1000);  // Convertir minutos a milisegundos

    // Enviar al renderizador el tiempo establecido
    mainWindow.webContents.send("playtime-set", { gameName, minutes });
});

ipcMain.on('game-unblocked', (event, gameName) => {
    // Reiniciar el tiempo del juego al momento del desbloqueo
    gameTimes[gameName] = { start: Date.now() }; // Reiniciar el temporizador a la fecha actual
    mainWindow.webContents.send('game-unblocked', gameName);
});

app.whenReady().then(() => {
    createWindow();
    createTray();

    setInterval(() => {
        getRunningGames().then(games => {
            const now = Date.now();

            games.forEach(gameName => {
                // Si el juego no está bloqueado, iniciar su tiempo
                if (!gameTimes[gameName]) {
                    gameTimes[gameName] = { start: now };
                }
            });

            // Enviar start times al renderer
            const gamesWithStart = games.map(gameName => ({
                name: gameName,
                start: gameTimes[gameName]?.start || 0
            }));

            mainWindow.webContents.send('update-game-list', gamesWithStart);
        });
    }, 5000);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
