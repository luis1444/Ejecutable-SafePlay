// authService.js (CON VERIFICACIÓN DE CONTRASEÑA)
let Store = require('electron-store');
Store = Store?.default ?? Store;

let keytar;
try { keytar = require('keytar'); } catch (_) {}

const store = new Store({ name: 'safeplay' });

try {
    if (typeof fetch === 'undefined') {
        const nodeFetch = require('node-fetch');
        global.fetch = nodeFetch;
    }
} catch (_) {}

/** CONFIG **/
const USE_MOCK = false;
const API_BASE_URL = process.env.API_BASE_URL || 'https://safeeplay.com';
/************/

async function saveTokenSecure(token) {
    if (keytar) {
        try { await keytar.setPassword('SafePlay', 'session_token', token); return; } catch (_) {}
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
        try { await keytar.deletePassword('SafePlay', 'session_token'); } catch (_) {}
    }
    store.delete('session_token');
}

/** Mock (solo para pruebas locales) **/
async function loginMock({ email, password }) {
    await new Promise(r => setTimeout(r, 300));
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

/** Decodificar JWT sin libs externas **/
function decodeJwt(token) {
    try {
        const [, payloadB64] = token.split('.');
        const json = Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
        return JSON.parse(json);
    } catch {
        return null;
    }
}

/** Login remoto: Render devuelve { message, token } **/
async function loginRemote({ email, password }) {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: email, password })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.token) {
        const msg = data?.error || data?.message || `Respuesta de login inválida: falta token. Recibido: ${JSON.stringify(data)}`;
        const err = new Error(msg);
        err.code = res.status;
        throw err;
    }

    let user = data.user;
    if (!user) {
        const payload = decodeJwt(data.token) || {};
        console.log('[Auth] JWT Payload:', payload);
        const id = payload.id ?? payload.userId ?? payload.sub ?? 'unknown';
        const username = payload.username ?? payload.name ?? 'Supervisor';
        user = {
            id,
            username,
            name: username,
            email: email, // Guardar el email usado para login
            role: 'supervisor',
        };
    } else if (!user.email) {
        user.email = email; // Asegurar que tengamos el email
    }

    console.log('[Auth] User después del login:', user);
    return { token: data.token, user };
}

/** 🔒 Verificar credenciales sin cambiar la sesión actual **/
async function verifyCredentialsRemote(email, password) {
    try {
        const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: email, password })
        });

        const data = await res.json().catch(() => ({}));

        // Si el login es exitoso, las credenciales son válidas
        if (res.ok && data?.token) {
            return true;
        }

        return false;
    } catch (error) {
        console.error('[Auth] Error verificando credenciales:', error);
        return false;
    }
}

async function verifyCredentialsMock(email, password) {
    await new Promise(r => setTimeout(r, 200));
    return email?.endsWith('@safeplay.dev') && password === '123456';
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
        store.delete('session_cookie');
    },

    async getSession() {
        const token = await getTokenSecure();
        const user = store.get('user', null);
        if (token && user) return { token, user };
        return null;
    },

    /** 🔒 Verificar contraseña del usuario actual **/
    async verifyCredentials(email, password) {
        return USE_MOCK
            ? await verifyCredentialsMock(email, password)
            : await verifyCredentialsRemote(email, password);
    }
};

module.exports = AuthService;