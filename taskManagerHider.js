// taskManagerHider.js - Ocultar proceso del Administrador de Tareas
const { exec } = require('child_process');
const os = require('os');

class TaskManagerHider {
    constructor() {
        this.isWindows = os.platform() === 'win32';
        this.checkInterval = null;
        this.isActive = false;
    }

    /**
     * Inicia el ocultamiento del proceso
     */
    start() {
        if (!this.isWindows) {
            console.log('[TaskManagerHider] Solo disponible en Windows');
            return;
        }

        if (this.isActive) {
            console.log('[TaskManagerHider] Ya está activo');
            return;
        }

        this.isActive = true;
        console.log('[TaskManagerHider] Iniciando ocultamiento...');

        // Cambiar prioridad del proceso para hacerlo menos visible
        this.setLowPriority();

        // Monitorear si el Administrador de Tareas está abierto
        this.startTaskManagerMonitoring();

        // Intentar ocultar usando técnicas de Windows
        this.hideFromTaskList();
    }

    /**
     * Detiene el ocultamiento
     */
    stop() {
        this.isActive = false;

        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }

        console.log('[TaskManagerHider] Ocultamiento detenido');
    }

    /**
     * Establece baja prioridad para ser menos visible
     */
    setLowPriority() {
        const pid = process.pid;

        // Cambiar a prioridad "Below Normal" para ser menos notorio
        exec(`wmic process where processid=${pid} CALL setpriority "below normal"`, (error) => {
            if (error) {
                console.warn('[TaskManagerHider] No se pudo cambiar prioridad:', error.message);
            } else {
                console.log('[TaskManagerHider] Prioridad reducida para ser menos visible');
            }
        });
    }

    /**
     * Intenta ocultar el proceso de la lista de tareas
     */
    hideFromTaskList() {
        // Nota: Windows 10/11 hace muy difícil ocultar procesos completamente
        // Esta función usa técnicas limitadas que funcionan parcialmente

        const pid = process.pid;

        // Cambiar el nombre del proceso en memoria (técnica avanzada, requiere privilegios)
        const script = `
            $proc = Get-Process -Id ${pid} -ErrorAction SilentlyContinue
            if ($proc) {
                # Intentar cambiar la descripción del proceso
                $proc.StartInfo.WindowStyle = 'Hidden'
            }
        `;

        exec(`powershell -Command "${script}"`, (error) => {
            if (error) {
                console.warn('[TaskManagerHider] No se pudo modificar propiedades del proceso');
            }
        });
    }

    /**
     * Monitorea si el Administrador de Tareas está abierto y toma medidas
     */
    startTaskManagerMonitoring() {
        this.checkInterval = setInterval(() => {
            if (!this.isActive) return;

            exec('tasklist /FI "IMAGENAME eq Taskmgr.exe" /NH', (error, stdout) => {
                if (!error && stdout.includes('Taskmgr.exe')) {
                    console.log('[TaskManagerHider] ⚠️  Administrador de Tareas detectado abierto');

                    // Aquí podrías implementar acciones adicionales como:
                    // - Notificar al usuario que está intentando cerrar la app
                    // - Registrar el evento
                    // - Aumentar la frecuencia de monitoreo

                    this.handleTaskManagerDetected();
                }
            });
        }, 3000); // Verificar cada 3 segundos
    }

    /**
     * Maneja la detección del Administrador de Tareas
     */
    handleTaskManagerDetected() {
        // Reducir aún más la visibilidad
        this.setLowPriority();

        // Podrías enviar una notificación al backend aquí
        // ApiService.logSecurityEvent('task_manager_opened');
    }

    /**
     * Intenta cerrar el Administrador de Tareas (MUY agresivo, usar con cuidado)
     */
    closeTaskManager() {
        if (!this.isWindows) return;

        console.log('[TaskManagerHider] ⚠️  ADVERTENCIA: Intentando cerrar Administrador de Tareas');

        // NOTA: Esta función es muy agresiva y puede molestar al usuario
        // Solo usar en entornos muy controlados o como última medida

        exec('taskkill /IM Taskmgr.exe /F', (error) => {
            if (error) {
                console.warn('[TaskManagerHider] No se pudo cerrar Administrador de Tareas (se requieren permisos)');
            } else {
                console.log('[TaskManagerHider] Administrador de Tareas cerrado');
            }
        });
    }

    /**
     * Bloquea el Administrador de Tareas mediante políticas de grupo (requiere admin)
     */
    blockTaskManager() {
        if (!this.isWindows) return;

        const regScript = `
            # Bloquear Administrador de Tareas mediante el registro
            $regPath = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System"
            
            # Crear la clave si no existe
            if (-not (Test-Path $regPath)) {
                New-Item -Path $regPath -Force | Out-Null
            }
            
            # Establecer el valor para deshabilitar Taskmgr
            Set-ItemProperty -Path $regPath -Name "DisableTaskMgr" -Value 1 -Type DWord
        `;

        exec(`powershell -Command "${regScript}"`, (error) => {
            if (error) {
                console.warn('[TaskManagerHider] No se pudo bloquear Administrador de Tareas (se requieren permisos)');
            } else {
                console.log('[TaskManagerHider] ⚠️  Administrador de Tareas bloqueado vía registro');
            }
        });
    }

    /**
     * Desbloquea el Administrador de Tareas
     */
    unblockTaskManager() {
        if (!this.isWindows) return;

        const regScript = `
            $regPath = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System"
            
            if (Test-Path $regPath) {
                Remove-ItemProperty -Path $regPath -Name "DisableTaskMgr" -ErrorAction SilentlyContinue
            }
        `;

        exec(`powershell -Command "${regScript}"`, (error) => {
            if (error) {
                console.warn('[TaskManagerHider] Error desbloqueando Administrador de Tareas');
            } else {
                console.log('[TaskManagerHider] Administrador de Tareas desbloqueado');
            }
        });
    }
}

module.exports = TaskManagerHider;