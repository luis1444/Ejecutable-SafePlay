const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const os = require('os');

let mainWindow;
let tray;
let gameTimes = {};   // { gameName: { start: timestamp } }
let playTimers = {};  // { gameName: timeoutId }

// Función para obtener los juegos activos (solo Steam)
function getRunningGames() {
    return new Promise((resolve, reject) => {
        const platform = os.platform();
        let command = '';

        if (platform === 'win32') {
            command = 'powershell "Get-Process | Select-Object ProcessName,Path"';
        } else if (platform === 'darwin' || platform === 'linux') {
            command = 'ps aux';
        }

        exec(command, { encoding: 'utf8', maxBuffer: 1024 * 500 }, (error, stdout, stderr) => {
            if (error) {
                console.error('Error ejecutando listado de procesos:', stderr);
                reject(`Error al obtener la lista de procesos: ${stderr}`);
                return;
            }

            let games = [];

            if (platform === 'win32') {
                const lines = stdout.split('\n').slice(3);
                for (let line of lines) {
                    line = line.trim();
                    if (!line) continue;

                    const parts = line.split(/\s{2,}/).filter(Boolean);
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

// Función para crear la ventana principal
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

// Crear icono en la bandeja
function createTray() {
    tray = new Tray(path.join(__dirname, 'assets', 'tray-icon.png'));
    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Salir', click: () => {
                app.quit();
            }
        }
    ]);

    tray.setToolTip('SafePlay App');
    tray.setContextMenu(contextMenu);
}

// 🔹 Bloquear un juego
function killGame(gameName) {
    const platform = os.platform();
    let command = '';

    if (platform === 'win32') {
        command = `taskkill /IM "${gameName}.exe" /F`;
    } else {
        command = `pkill -f ${gameName}`;
    }

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error al cerrar el juego: ${stderr}`);
            mainWindow.webContents.send('game-blocked', {
                name: gameName,
                success: false,
                message: `❌ No se pudo cerrar ${gameName}.`
            });
        } else {
            console.log(`Juego bloqueado: ${stdout}`);
            mainWindow.webContents.send('game-blocked', {
                name: gameName,
                success: true,
                message: `✅ Juego cerrado: ${gameName}`
            });
        }
    });
}

// Evento manual
ipcMain.on('block-game', (event, gameName) => {
    killGame(gameName);
});

// ⏱️ Establecer tiempo límite para un juego
ipcMain.on("set-playtime", (event, { gameName, minutes }) => {
    console.log(`⏱️ Tiempo de juego configurado para ${gameName}: ${minutes} minutos`);

    if (playTimers[gameName]) {
        clearTimeout(playTimers[gameName]);
    }

    playTimers[gameName] = setTimeout(() => {
        console.log(`⏰ Tiempo terminado para ${gameName}. Cerrando...`);
        killGame(gameName);
        mainWindow.webContents.send("time-up", gameName);
    }, minutes * 60 * 1000);
});

// Inicializar app
app.whenReady().then(() => {
    createWindow();
    createTray();
    setInterval(() => {
        getRunningGames().then(games => {
            const now = Date.now();

            games.forEach(gameName => {
                if (!gameTimes[gameName]) {
                    gameTimes[gameName] = { start: now };
                }
            });

            const gamesWithTime = games.map(gameName => {
                const start = gameTimes[gameName]?.start || now;
                const elapsed = Math.floor((now - start) / 1000);
                return { name: gameName, elapsed };
            });

            mainWindow.webContents.send('update-game-list', gamesWithTime);
        }).catch(err => {
            console.error('Error al obtener los juegos:', err);
        });
    }, 5000);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
