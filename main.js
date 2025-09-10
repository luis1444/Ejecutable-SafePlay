const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const os = require('os');

let mainWindow;
let tray;

// Función para obtener los juegos activos (solo Steam)
function getRunningGames() {
    return new Promise((resolve, reject) => {
        const platform = os.platform();
        let command = '';

        if (platform === 'win32') {
            // Usamos PowerShell porque WMIC está obsoleto
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
                const lines = stdout.split('\n').slice(3); // saltamos cabecera
                for (let line of lines) {
                    line = line.trim();
                    if (!line) continue;

                    const parts = line.split(/\s{2,}/).filter(Boolean);
                    if (parts.length < 2) continue;

                    const exeName = parts[0];
                    const exePath = parts[1];

                    // 🔑 Solo mostrar procesos que vienen de carpetas de juegos Steam
                    if (exePath && exePath.toLowerCase().includes('steamapps\\common')) {
                        games.push({
                            name: exeName.replace('.exe', ''),
                            path: exePath
                        });
                    }
                }

                // 🔑 Eliminar duplicados: un juego = un proceso principal
                const uniqueGames = {};
                games.forEach(game => {
                    const folder = path.dirname(game.path);
                    if (!uniqueGames[folder]) {
                        uniqueGames[folder] = game.name;
                    }
                });

                games = Object.values(uniqueGames);
            } else {
                // En Linux/Mac: buscamos procesos de Steam
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

            console.log('Juegos principales detectados:', games);
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
            contextIsolation: false // 🔑 activado para que ipcRenderer funcione
        }
    });

    mainWindow.loadFile('index.html');
}

// Función para crear el icono en la bandeja
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

// Función para bloquear el juego
ipcMain.on('block-game', (event, gameName) => {
    console.log(`Intentando bloquear: ${gameName}`);
    const platform = os.platform();
    let command = '';

    if (platform === 'win32') {
        command = `taskkill /IM "${gameName}.exe" /F`;
    } else if (platform === 'darwin' || platform === 'linux') {
        command = `pkill -f ${gameName}`;
    }

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error al cerrar el juego: ${stderr}`);
        } else {
            console.log(`Juego bloqueado: ${stdout}`);
        }
    });
});

// Inicializa la aplicación
app.whenReady().then(() => {
    createWindow();
    createTray();
    setInterval(() => {
        getRunningGames().then(games => {
            console.log('Enviando juegos al frontend:', games);
            mainWindow.webContents.send('update-game-list', games);
        }).catch(err => {
            console.error('Error al obtener los juegos:', err);
        });
    }, 5000); // Actualizar cada 5 segundos
});

// Cierra la app cuando todas las ventanas están cerradas
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Vuelve a crear la ventana en Mac si es necesario
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
