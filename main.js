const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const os = require('os');

let mainWindow;
let tray;
let gameTimes = {};  // { gameName: { start: timestamp } }
let playTimers = {}; // { gameName: timeoutId }

function getRunningGames() {
    return new Promise((resolve, reject) => {
        const platform = os.platform();
        const command = platform === 'win32'
            ? 'powershell "Get-Process | Select-Object ProcessName,Path"'
            : 'ps aux';

        exec(command, { encoding: 'utf8', maxBuffer: 1024 * 500 }, (error, stdout, stderr) => {
            if (error) return reject(`Error al obtener procesos: ${stderr}`);

            let games = [];
            const lines = stdout.split('\n').slice(platform === 'win32' ? 3 : 1);
            lines.forEach(line => {
                if (!line.trim()) return;
                const parts = line.trim().split(/\s+/);
                const exeName = platform === 'win32' ? parts[0] : parts[parts.length - 1];
                const exePath = platform === 'win32' ? parts[1] : undefined;
                if (exePath && exePath.toLowerCase().includes('steamapps\\common') || exeName.toLowerCase().includes('steamapps')) {
                    games.push(platform === 'win32'
                        ? { name: exeName.replace('.exe', ''), path: exePath }
                        : exeName.replace('.exe', '')
                    );
                }
            });

            resolve([...new Set(games.map(game => path.dirname(game.path || game)))]);
        });
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800, height: 600, icon: path.join(__dirname, 'assets', 'icon.png'),
        webPreferences: { nodeIntegration: true, contextIsolation: false }
    });
    mainWindow.loadFile('index.html');
}

function createTray() {
    tray = new Tray(path.join(__dirname, 'assets', 'tray-icon.png'));
    tray.setToolTip('SafePlay App');
    tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Salir', click: () => app.quit() }]));
}

function killGame(gameName) {
    const platform = os.platform();
    const command = platform === 'win32' ? `taskkill /IM "${gameName}.exe" /F` : `pkill -f ${gameName}`;
    exec(command, (error) => {
        mainWindow.webContents.send('game-blocked', {
            name: gameName, success: !error,
            message: error ? `❌ No se pudo cerrar ${gameName}.` : `✅ Juego cerrado: ${gameName}`
        });
    });
}

ipcMain.on('block-game', (event, gameName) => {
    if (playTimers[gameName]) { clearTimeout(playTimers[gameName]); delete playTimers[gameName]; }
    delete gameTimes[gameName];
    killGame(gameName);
});

ipcMain.on('set-playtime', (event, { gameName, minutes }) => {
    if (playTimers[gameName]) { clearTimeout(playTimers[gameName]); delete playTimers[gameName]; }
    gameTimes[gameName] = { start: Date.now() };
    playTimers[gameName] = setTimeout(() => {
        killGame(gameName);
        mainWindow.webContents.send("time-up", gameName);
    }, minutes * 60 * 1000);

    mainWindow.webContents.send("playtime-set", { gameName, minutes });
});

ipcMain.on('game-unblocked', (event, gameName) => {
    gameTimes[gameName] = { start: Date.now() };
    mainWindow.webContents.send('game-unblocked', gameName);
});

app.whenReady().then(() => {
    createWindow();
    createTray();
    setInterval(() => {
        getRunningGames().then(games => {
            const now = Date.now();
            games.forEach(gameName => {
                if (!gameTimes[gameName]) gameTimes[gameName] = { start: now };
            });

            mainWindow.webContents.send('update-game-list', games.map(gameName => ({
                name: gameName, start: gameTimes[gameName].start || 0
            })));
        });
    }, 5000);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
