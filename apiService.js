// apiService.js (proceso main de Electron)
const AuthService = require('./authService');

const API_BASE_URL = process.env.API_BASE_URL || 'https://safeeplay.com';

class ApiService {
    /**
     * Obtiene comandos pendientes del servidor
     */
    static async fetchPendingCommands() {
        const session = await AuthService.getSession();
        console.log('[ApiService] Session:', session?.token ? 'OK' : 'NO TOKEN');

        if (!session?.token) {
            throw new Error('No hay sesión activa');
        }

        console.log(`[ApiService] Consultando: ${API_BASE_URL}/api/electron/commands/pending`);

        const res = await fetch(`${API_BASE_URL}/api/electron/commands/pending`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${session.token}`,
                'Content-Type': 'application/json'
            }
        });

        console.log(`[ApiService] Response status: ${res.status}`);

        if (!res.ok) {
            const error = await res.json().catch(() => ({}));
            console.error('[ApiService] Error response:', error);
            throw new Error(error.error || `HTTP ${res.status}`);
        }

        const data = await res.json();
        console.log('[ApiService] Commands received:', data);
        return data.commands || [];
    }

    /**
     * Marca un comando como ejecutado
     */
    static async markCommandExecuted(commandId) {
        const session = await AuthService.getSession();
        if (!session?.token) return;

        try {
            const res = await fetch(`${API_BASE_URL}/api/electron/commands/${commandId}/executed`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${session.token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!res.ok) {
                console.error(`Error marcando comando ${commandId} como ejecutado`);
            }
        } catch (error) {
            console.error(`Error de red marcando comando ${commandId}:`, error);
        }
    }

    /**
     * Marca un comando como fallido
     */
    static async markCommandFailed(commandId, errorMessage) {
        const session = await AuthService.getSession();
        if (!session?.token) return;

        try {
            const res = await fetch(`${API_BASE_URL}/api/electron/commands/${commandId}/failed`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${session.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ errorMessage })
            });

            if (!res.ok) {
                console.error(`Error marcando comando ${commandId} como fallido`);
            }
        } catch (error) {
            console.error(`Error de red marcando comando ${commandId}:`, error);
        }
    }

    /**
     * Envía un log de actividad al servidor
     */
    static async logActivity(gameName, action, duration = null, details = {}) {
        const session = await AuthService.getSession();
        if (!session?.token) return;

        try {
            const res = await fetch(`${API_BASE_URL}/api/electron/activity`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    gameName,
                    action,
                    duration,
                    details
                })
            });

            if (!res.ok) {
                console.error('Error enviando log de actividad');
            }
        } catch (error) {
            console.error('Error de red enviando log:', error);
        }
    }

    /**
     * Envía múltiples logs en batch (optimización)
     */
    static async logActivitiesBatch(activities) {
        const session = await AuthService.getSession();
        if (!session?.token || !activities.length) return;

        try {
            const res = await fetch(`${API_BASE_URL}/api/electron/activity/batch`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ activities })
            });

            if (!res.ok) {
                console.error('Error enviando batch de actividades');
            }
        } catch (error) {
            console.error('Error de red enviando batch:', error);
        }
    }
}

module.exports = ApiService;

