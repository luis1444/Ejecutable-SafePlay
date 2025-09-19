// authService.js (proceso main) — compatible con electron-store ESM/CJS
let Store = require('electron-store');
Store = Store?.default ?? Store; // <- toma default si existe (v10+ ESM)

let keytar;
try { keytar = require('keytar'); } catch (_) { /* opcional */ }

const store = new Store({ name: 'safeplay' });

// Si tu Electron/Node no trae fetch global y luego desactivas USE_MOCK, esto lo cubre:
try {
    if (typeof fetch === 'undefined') {
        const nodeFetch = require('node-fetch'); // instala con `npm i node-fetch` si lo necesitas
        global.fetch = nodeFetch;
    }
} catch (_) { /* ignorar si no se usa login remoto */ }

// ====== CONFIG ======
const USE_MOCK = true; // <-- ponlo en false cuando conectes a Render
const API_BASE_URL = process.env.API_BASE_URL || 'https://TU-APP.onrender.com'; // ej: https://safeplay.onrender.com
// ====================

async function saveTokenSecure(token) {
    if (keytar) {
        try {
            await keytar.setPassword('SafePlay', 'session_token', token);
            return;
        } catch (_) {}
    }
    store.set('session_token', token);
}

async function getTokenSecure() {
    if (keytar) {
        try {
            const t = await keytar.getPassword('SafePlay', 'session_token');
            if (t) return t;
        } catch (_) {}
    }
    return store.get('session_token', null);
}

async function clearTokenSecure() {
    if (keytar) {
        try {
            await keytar.deletePassword('SafePlay', 'session_token');
        } catch (_) {}
    }
    store.delete('session_token');
}

async function loginMock({ email, password }) {
    // Simula validación: solo correos de dominio safeplay.dev y pass 123456
    await new Promise(r => setTimeout(r, 500));
    const ok = email?.endsWith('@safeplay.dev') && password === '123456';
    if (!ok) {
        const err = new Error('Credenciales inválidas o supervisor no registrado.');
        err.code = 401;
        throw err;
    }
    return {
        token: 'mock-token-abc123',
        user: { id: 'demo-supervisor', email, role: 'supervisor', name: 'Demo Supervisor' },
    };
}

async function loginRemote({ email, password }) {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, client: 'electron' }),
    });
    if (!res.ok) {
        const msg = await res.text().catch(() => '');
        const err = new Error(msg || 'Error de autenticación');
        err.code = res.status;
        throw err;
    }
    // Espera { token, user }
    return res.json();
}

const AuthService = {
    async login(credentials) {
        const data = USE_MOCK ? await loginMock(credentials) : await loginRemote(credentials);
        await saveTokenSecure(data.token);
        store.set('user', data.user);
        return data;
    },
    async logout() {
        await clearTokenSecure();
        store.delete('user');
    },
    async getSession() {
        const token = await getTokenSecure();
        const user = store.get('user', null);
        if (token && user) return { token, user };
        return null;
    }
};

module.exports = AuthService;
