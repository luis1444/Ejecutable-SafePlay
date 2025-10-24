// securityConfig.js - Configuración del sistema de seguridad

module.exports = {
    // ==================== AUTENTICACIÓN ====================
    // Requiere contraseña para cerrar la aplicación
    requirePasswordToClose: true,

    // Requiere contraseña para cerrar sesión
    requirePasswordToLogout: true,

    // Requiere contraseña para salir desde el tray
    requirePasswordForTrayExit: true,

    // ==================== PROTECCIÓN DE PROCESO ====================
    // Activar protección del proceso (reinicio automático)
    enableProcessProtection: true,

    // Intervalo de monitoreo del proceso (ms)
    processCheckInterval: 3000,

    // Máximo de intentos de reinicio automático
    maxRestartAttempts: 5,

    // ==================== OFUSCACIÓN ====================
    // Cambiar el nombre del proceso en el Task Manager
    obfuscateProcessName: true,

    // Nombre alternativo para el proceso
    obfuscatedProcessName: 'Windows Security Service',

    // Ocultar de herramientas de monitoreo
    hideFromMonitoringTools: true,

    // ==================== PRIORIDAD DEL PROCESO ====================
    // Establecer prioridad alta del proceso
    setHighPriority: true,

    // Nivel de prioridad: 'low', 'belownormal', 'normal', 'abovenormal', 'high', 'realtime'
    priorityLevel: 'high',

    // ==================== PREVENCIÓN DE CIERRE ====================
    // Bloquear señales de terminación (SIGINT, SIGTERM, etc.)
    blockTerminationSignals: true,

    // Continuar ejecución en caso de errores no capturados
    continueOnUncaughtErrors: true,

    // ==================== VENTANA ====================
    // Recrear ventana automáticamente si es destruida
    autoRecreateWindow: true,

    // Intervalo de verificación de ventana (ms)
    windowCheckInterval: 2000,

    // ==================== TRAY ICON ====================
    // Mantener icono del tray siempre visible
    keepTrayIconVisible: true,

    // ==================== MODO DEBUG ====================
    // Modo debug (desactiva todas las protecciones para desarrollo)
    debugMode: false,

    // Mostrar logs de seguridad en consola
    verboseSecurityLogs: true,

    // ==================== TIMEOUTS ====================
    // Tiempo de espera antes de activar protecciones (ms)
    protectionStartDelay: 2000,

    // Tiempo de espera antes de iniciar CommandExecutor (ms)
    commandExecutorDelay: 1500
};
