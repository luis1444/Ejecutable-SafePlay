const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const os = require('os');

let mainWindow;
let tray;

// Función para obtener los juegos activos
function getRunningGames() {
    return new Promise((resolve, reject) => {
        const platform = os.platform();
        let command = '';

        if (platform === 'win32') {
            command = 'tasklist /FI "STATUS eq running" /FO LIST';
        } else if (platform === 'darwin' || platform === 'linux') {
            command = 'ps aux';
        }

        exec(command, { encoding: 'latin1' }, (error, stdout, stderr) => {
            if (error) {
                console.error('Error ejecutando tasklist:', stderr);
                reject(`Error al obtener la lista de procesos: ${stderr}`);
                return;
            }

            let games = [];

            if (platform === 'win32') {
                const lines = stdout.split('\n');
                let currentImageName = '';
                let processCount = 0;

                for (let line of lines) {
                    line = line.trim();
                    if (line.startsWith('Nombre de imagen:') || line.startsWith('Image Name:')) {
                        if (currentImageName) {
                            if (currentImageName.endsWith('.exe')) {
                                const lowerName = currentImageName.toLowerCase();
                                if (lowerName.includes('steam') || lowerName.includes('stumble guys') || lowerName.includes('gameoverlayui')) {
                                    games.push(currentImageName);
                                }
                            }
                        }
                        currentImageName = line.split(':')[1]?.trim() || '';
                        processCount++;
                    }
                }

                if (currentImageName) {
                    if (currentImageName.endsWith('.exe')) {
                        const lowerName = currentImageName.toLowerCase();
                        if (lowerName.includes('steam') || lowerName.includes('stumble guys') || lowerName.includes('gameoverlayui')) {
                            games.push(currentImageName);
                        }
                    }
                }

                console.log(`Cantidad de procesos encontrados: ${processCount}`);
            } else {
                const lines = stdout.split('\n').slice(1);
                lines.forEach(line => {
                    if (!line.trim()) return;
                    const parts = line.trim().split(/\s{2,}/);
                    const command = parts[parts.length - 1];
                    const processName = command.split('/').pop();
                    const lowerName = processName.toLowerCase();
                    if (lowerName.includes('steam') || lowerName.includes('stumble guys') || lowerName.includes('gameoverlayui')) {
                        games.push(processName);
                    }
                });
            }

            console.log('Juegos filtrados (Steam-related):', games);
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
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: true,
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
        command = `taskkill /IM "${gameName}" /F`;
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
