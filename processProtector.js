// processProtector.js - Protección avanzada del proceso
const { exec } = require('child_process');
const path = require('path');
const os = require('os');

class ProcessProtector {
    constructor() {
        this.isWindows = os.platform() === 'win32';
        this.processName = path.basename(process.execPath);
        this.monitorInterval = null;
        this.restartAttempts = 0;
        this.maxRestartAttempts = 3;
        this.isActive = false;
    }

    /**
     * Inicia la protección del proceso
     */
    start() {
        if (this.isActive) {
            console.log('[ProcessProtector] Ya está activo');
            return;
        }

        this.isActive = true;
        console.log('[ProcessProtector] Iniciando protección del proceso...');

        if (this.isWindows) {
            this.protectWindowsProcess();
            this.hideFromTaskManager();
        }

        this.startMonitoring();
    }

    /**
     * Detiene la protección del proceso
     */
    stop() {
        this.isActive = false;

        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
        }

        console.log('[ProcessProtector] Protección detenida');
    }

    /**
     * Oculta el proceso del Administrador de Tareas (Windows)
     */
    hideFromTaskManager() {
        if (!this.isWindows) return;

        try {
            // Cambiar la prioridad del proceso para hacerlo menos visible
            exec(`wmic process where processid=${process.pid} CALL setpriority "idle"`, (error) => {
                if (error) {
                    console.warn('[ProcessProtector] No se pudo cambiar prioridad:', error.message);
                }
            });

            // Intentar ocultar la ventana del proceso de la lista de tareas
            // Esto requiere modificaciones adicionales en el BrowserWindow
            console.log('[ProcessProtector] Proceso configurado para ser menos visible');
        } catch (error) {
            console.error('[ProcessProtector] Error ocultando proceso:', error);
        }
    }

    /**
     * Protege el proceso contra terminación forzada (Windows)
     */
    protectWindowsProcess() {
        if (!this.isWindows) return;

        try {
            // Establecer el proceso como crítico del sistema (requiere privilegios de admin)
            const script = `
                $signature = @"
                [DllImport("ntdll.dll", SetLastError=true)]
                public static extern void RtlSetProcessIsCritical(UInt32 v1, UInt32 v2, UInt32 v3);
"@
                $ntdll = Add-Type -MemberDefinition $signature -Name NtDll -Namespace Win32 -PassThru
                $ntdll::RtlSetProcessIsCritical(1, 0, 0)
            `;

            // ADVERTENCIA: Esto puede hacer que el sistema se reinicie si se fuerza el cierre
            // Solo descomentar en entornos de producción controlados
            /*
            exec(`powershell -Command "${script}"`, (error) => {
                if (error) {
                    console.warn('[ProcessProtector] No se pudo marcar como crítico (requiere admin)');
                } else {
                    console.log('[ProcessProtector] Proceso marcado como crítico del sistema');
                }
            });
            */

        } catch (error) {
            console.error('[ProcessProtector] Error en protección Windows:', error);
        }
    }

    /**
     * Previene la terminación del proceso
     */
    preventTermination() {
        if (!this.isWindows) return;

        // Interceptar señales de terminación
        process.on('SIGTERM', () => {
            console.log('[ProcessProtector] SIGTERM bloqueado');
        });

        process.on('SIGINT', () => {
            console.log('[ProcessProtector] SIGINT bloqueado');
        });

        // En Windows, interceptar eventos de cierre
        if (this.isWindows) {
            process.on('exit', (code) => {
                if (this.isActive && code !== 0) {
                    console.log('[ProcessProtector] Intento de cierre no autorizado detectado');
                    // Reiniciar la aplicación
                    this.restartApplication();
                }
            });
        }
    }

    /**
     * Monitorea el estado del proceso
     */
    startMonitoring() {
        const checkInterval = 3000; // Verificar cada 3 segundos

        this.monitorInterval = setInterval(() => {
            if (!this.isActive) {
                clearInterval(this.monitorInterval);
                return;
            }

            this.checkProcessHealth();
        }, checkInterval);
    }

    /**
     * Verifica la salud del proceso
     */
    checkProcessHealth() {
        if (!this.isWindows) return;

        exec(`tasklist /FI "PID eq ${process.pid}" /FO CSV /NH`, (error, stdout) => {
            if (error || !stdout.includes(this.processName)) {
                console.log('[ProcessProtector] Proceso en riesgo, tomando medidas...');
                this.handleProcessThreat();
            }
        });
    }

    /**
     * Maneja amenazas al proceso
     */
    handleProcessThreat() {
        if (this.restartAttempts >= this.maxRestartAttempts) {
            console.error('[ProcessProtector] Máximo de intentos de reinicio alcanzado');
            return;
        }

        this.restartAttempts++;
        console.log(`[ProcessProtector] Intento de reinicio ${this.restartAttempts}/${this.maxRestartAttempts}`);

        // Esperar un momento antes de reiniciar
        setTimeout(() => {
            this.restartApplication();
        }, 1000);
    }

    /**
     * Reinicia la aplicación
     */
    restartApplication() {
        const { app } = require('electron');

        console.log('[ProcessProtector] Reiniciando aplicación...');
        app.relaunch();
        app.exit(0);
    }

    /**
     * Detecta intentos de kill desde el Administrador de Tareas
     */
    detectTaskManagerKill() {
        if (!this.isWindows) return;

        // Monitorear si el Administrador de Tareas está abierto
        setInterval(() => {
            exec('tasklist /FI "IMAGENAME eq Taskmgr.exe"', (error, stdout) => {
                if (!error && stdout.includes('Taskmgr.exe')) {
                    console.log('[ProcessProtector] Administrador de Tareas detectado');
                    // Aquí podrías implementar medidas adicionales
                }
            });
        }, 5000);
    }

    /**
     * Ofuscar el nombre del proceso (cambiar título de la ventana)
     */
    obfuscateProcess(mainWindow) {
        if (mainWindow && !mainWindow.isDestroyed()) {
            // Cambiar el título para que sea menos identificable
            mainWindow.setTitle('Sistema de Windows');

            // Establecer como aplicación en segundo plano
            mainWindow.setSkipTaskbar(false);
        }
    }
}

module.exports = ProcessProtector;