
// commandExecutor.js
const ApiService = require('./apiService');

class CommandExecutor {
    constructor(mainWindow, killGameFn, setPlaytimeFn, showOverlayFn) {
        this.mainWindow = mainWindow;
        this.killGame = killGameFn;
        this.setPlaytime = setPlaytimeFn;
        this.showOverlay = showOverlayFn;
        console.log('[CommandExecutor] Inicializado');
    }

    /**
     * Procesa un comando del servidor
     */
    async executeCommand(command) {
        const { id, action, target, duration } = command;

        console.log(`[CommandExecutor] Ejecutando comando ${id}: ${action} ${target || ''}`);

        try {
            switch (action) {
                case 'block':
                    console.log(`[CommandExecutor] Bloqueando: ${target}`);
                    await this.executeBlock(target);
                    break;

                case 'unblock':
                    console.log(`[CommandExecutor] Desbloqueando: ${target}`);
                    await this.executeUnblock(target);
                    break;

                case 'set_timer':
                    console.log(`[CommandExecutor] Timer: ${target} por ${duration}min`);
                    await this.executeSetTimer(target, duration);
                    break;

                case 'get_status':
                    console.log('[CommandExecutor] Obteniendo estado');
                    await this.executeGetStatus();
                    break;

                default:
                    throw new Error(`Acción desconocida: ${action}`);
            }

            // Marcar como ejecutado
            await ApiService.markCommandExecuted(id);
            console.log(`[CommandExecutor] ✅ Comando ${id} ejecutado exitosamente`);

        } catch (error) {
            console.error(`[CommandExecutor] ❌ Error ejecutando comando ${id}:`, error.message);
            await ApiService.markCommandFailed(id, error.message);
        }
    }

    /**
     * Bloquea un juego (cierra el proceso)
     */
    async executeBlock(gameName) {
        if (!gameName) {
            throw new Error('Nombre de juego requerido para bloquear');
        }

        console.log(`[CommandExecutor] killGame("${gameName}")`);
        this.killGame(gameName);

        this.showOverlay({
            variant: 'warn',
            title: 'Juego bloqueado remotamente',
            body: `El supervisor bloqueó <b>${gameName}</b> desde la web.`,
            duration: 5000
        });

        // Log al servidor
        await ApiService.logActivity(gameName, 'blocked', null, {
            reason: 'Comando remoto desde web'
        });
    }

    /**
     * Desbloquea un juego
     */
    async executeUnblock(gameName) {
        if (!gameName) {
            throw new Error('Nombre de juego requerido para desbloquear');
        }

        this.showOverlay({
            variant: 'success',
            title: 'Juego desbloqueado',
            body: `El supervisor desbloqueó <b>${gameName}</b>.`,
            duration: 4000
        });

        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('game-unblocked', gameName);
        }

        await ApiService.logActivity(gameName, 'unblocked', null, {
            reason: 'Comando remoto desde web'
        });
    }

    /**
     * Establece un cronómetro para un juego
     */
    async executeSetTimer(gameName, minutes) {
        if (!gameName || !minutes) {
            throw new Error('Nombre de juego y minutos requeridos para set_timer');
        }

        console.log(`[CommandExecutor] setPlaytime("${gameName}", ${minutes})`);
        this.setPlaytime(gameName, minutes);

        this.showOverlay({
            variant: 'info',
            title: 'Tiempo establecido remotamente',
            body: `El supervisor estableció <b>${minutes} min</b> para <b>${gameName}</b>.`,
            duration: 5000
        });

        // Log al servidor
        await ApiService.logActivity(gameName, 'timer_set', null, {
            minutes,
            source: 'Comando remoto'
        });
    }

    /**
     * Obtiene el estado actual
     */
    async executeGetStatus() {
        await ApiService.logActivity('system', 'started', null, {
            message: 'Estado solicitado',
            platform: process.platform
        });

        this.showOverlay({
            variant: 'info',
            title: 'Estado reportado',
            body: 'Se envió el estado actual al servidor.',
            duration: 3000
        });
    }
}

module.exports = CommandExecutor;