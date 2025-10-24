// renderer.js (CON PROTECCIÓN DE CONTRASEÑA)
const { ipcRenderer } = require('electron');

// ==================== Drawer + Sesión + Logout ====================
document.addEventListener('DOMContentLoaded', () => {
    const drawer  = document.getElementById('sessionDrawer');
    const overlay = document.getElementById('drawerOverlay');
    const btnOpen = document.getElementById('accountBtn');
    const btnClose= document.getElementById('drawerClose');
    const logoutBtn = document.getElementById('logoutBtn');

    function openDrawer(){
        if (!drawer || !overlay) return;
        drawer.classList.add('open');
        overlay.classList.add('open');
        drawer.setAttribute('aria-hidden', 'false');
    }
    function closeDrawer(){
        if (!drawer || !overlay) return;
        drawer.classList.remove('open');
        overlay.classList.remove('open');
        drawer.setAttribute('aria-hidden', 'true');
    }

    btnOpen  && btnOpen.addEventListener('click', openDrawer);
    btnClose && btnClose.addEventListener('click', closeDrawer);
    overlay  && overlay.addEventListener('click', closeDrawer);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

    // Cargar datos de sesión
    (async () => {
        try {
            const res = await ipcRenderer.invoke('auth:getSession');
            if (!res?.ok) {
                location.replace('login.html');
                return;
            }
            const user  = res.session.user || {};
            const name  = user.name || user.email || 'Supervisor';
            const email = user.email || '—';
            const role  = user.role || 'supervisor';

            const infoName  = document.getElementById('infoName');
            const infoEmail = document.getElementById('infoEmail');
            const infoRole  = document.getElementById('infoRole');
            if (infoName)  infoName.textContent  = name;
            if (infoEmail) infoEmail.textContent = email;
            if (infoRole)  infoRole.textContent  = role;

            const avatar = document.querySelector('.account-avatar');
            const initial = (name || email).trim()[0]?.toUpperCase() || 'S';
            if (avatar) avatar.textContent = initial;
        } catch {
            location.replace('login.html');
        }
    })();

    // 🔒 Logout con confirmación
    logoutBtn && logoutBtn.addEventListener('click', async () => {
        try {
            const result = await ipcRenderer.invoke('auth:logout');

            if (result.ok) {
                closeDrawer();
                location.replace('login.html');
            } else {
                // Usuario canceló o contraseña incorrecta
                console.log('Logout cancelado');
            }
        } catch (error) {
            console.error('Error en logout:', error);
        }
    });

    // 🔒 Crear modal de contraseña dinámicamente
    ensurePasswordModal();
});

// ==================== Modal de Contraseña ====================
function ensurePasswordModal() {
    let passwordModal = document.getElementById('passwordModal');
    if (passwordModal) return passwordModal;

    const tpl = document.createElement('div');
    tpl.innerHTML = `
    <div id="passwordModal" class="modal password-modal" aria-hidden="true" role="dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h2 class="modal-title">🔒 Autenticación requerida</h2>
        </div>
        <p id="passwordModalMessage" class="modal-sub">Por favor, ingresa tu contraseña para continuar.</p>

        <div class="password-field-wrapper">
          <label class="field password-field" for="passwordInput">
            <span>🔑</span>
            <input type="password" id="passwordInput" placeholder="Contraseña" autocomplete="current-password"/>
          </label>
        </div>

        <div class="modal-actions">
          <button id="cancelPasswordBtn" class="cancel-button">Cancelar</button>
          <button id="confirmPasswordBtn" class="confirm-button">✓ Confirmar</button>
        </div>
      </div>
    </div>
  `.trim();
    document.body.appendChild(tpl.firstElementChild);
    return document.getElementById('passwordModal');
}

// Escuchar solicitud de contraseña desde el proceso principal
ipcRenderer.on('show-password-dialog', (_event, { action }) => {
    openPasswordDialog(action);
});

function openPasswordDialog(action = 'realizar esta acción') {
    const passwordModal = ensurePasswordModal();
    const passwordModalMessage = document.getElementById('passwordModalMessage');
    const passwordInput = document.getElementById('passwordInput');
    const confirmPasswordBtn = document.getElementById('confirmPasswordBtn');
    const cancelPasswordBtn = document.getElementById('cancelPasswordBtn');

    if (!passwordModal || !passwordInput || !confirmPasswordBtn || !cancelPasswordBtn) {
        console.warn('Modal de contraseña no encontrado');
        return;
    }

    passwordModalMessage.textContent = `Ingresa tu contraseña para ${action}:`;
    passwordInput.value = '';

    // Mostrar modal
    passwordModal.classList.add('is-open');
    passwordModal.style.display = '';
    passwordModal.setAttribute('aria-hidden', 'false');

    // Enfocar input
    setTimeout(() => passwordInput.focus(), 100);

    // Handler para confirmar
    const confirmHandler = () => {
        const password = passwordInput.value.trim();
        ipcRenderer.send('password-dialog-response', password);
        closePasswordDialog();
    };

    // Handler para cancelar
    const cancelHandler = () => {
        ipcRenderer.send('password-dialog-response', null);
        closePasswordDialog();
    };

    // Asignar eventos
    confirmPasswordBtn.onclick = confirmHandler;
    cancelPasswordBtn.onclick = cancelHandler;

    // Permitir Enter para confirmar
    passwordInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            confirmHandler();
        } else if (e.key === 'Escape') {
            cancelHandler();
        }
    };

    // Prevenir cierre con clic afuera (esto es una acción crítica)
    passwordModal.onclick = (e) => {
        if (e.target === passwordModal) {
            // No cerrar - es una acción de seguridad
            passwordInput.focus();
        }
    };
}

function closePasswordDialog() {
    const passwordModal = document.getElementById('passwordModal');
    if (!passwordModal) return;

    passwordModal.classList.remove('is-open');
    passwordModal.style.display = 'none';
    passwordModal.setAttribute('aria-hidden', 'true');
}

// ==================== Timer Modal (auto-inyección si falta) ====================
let currentGameForTimer = null;
let modalOpen = false;

function ensureTimerModal() {
    let timerModal = document.getElementById('timerModal');
    if (timerModal) return timerModal;

    const tpl = document.createElement('div');
    tpl.innerHTML = `
    <div id="timerModal" class="modal" aria-hidden="true" role="dialog" aria-labelledby="timerTitle">
      <div class="modal-content">
        <div class="modal-header">
          <h2 id="timerTitle" class="modal-title">⏱️ Establecer tiempo de juego</h2>
          <button id="cancelTimerBtn" class="close-btn" aria-label="Cerrar">Cerrar</button>
        </div>
        <p id="modalGameName" class="modal-sub">Selecciona horas y minutos de sesión.</p>

        <div class="modal-grid">
          <label class="field" for="hoursInput">
            <span>🕒</span>
            <input type="text" id="hoursInput" placeholder="Horas" maxlength="2" inputmode="numeric"/>
          </label>
          <label class="field" for="minutesInput">
            <span>⌛</span>
            <input type="text" id="minutesInput" placeholder="Minutos" maxlength="2" inputmode="numeric"/>
          </label>
        </div>

        <div class="modal-actions">
          <button id="confirmTimerBtn" class="timer-button">Aceptar</button>
        </div>
      </div>
    </div>
  `.trim();
    document.body.appendChild(tpl.firstElementChild);
    return document.getElementById('timerModal');
}

function openTimerModal(gameName, friendlyName){
    const timerModal = ensureTimerModal();

    const modalGameName  = document.getElementById("modalGameName");
    const hoursInput     = document.getElementById("hoursInput");
    const minutesInput   = document.getElementById("minutesInput");
    const confirmTimerBtn= document.getElementById("confirmTimerBtn");
    const cancelTimerBtn = document.getElementById("cancelTimerBtn");

    if (!timerModal || !modalGameName || !hoursInput || !minutesInput || !confirmTimerBtn || !cancelTimerBtn) {
        console.warn('Modal/inputs no encontrados');
        return;
    }

    currentGameForTimer = gameName;
    modalGameName.textContent = `Juego: ${friendlyName}`;
    hoursInput.value = "";
    minutesInput.value = "";

    timerModal.classList.add('is-open');
    timerModal.style.display = '';
    timerModal.setAttribute('aria-hidden', 'false');
    modalOpen = true;

    confirmTimerBtn.onclick = () => {
        const hours = parseInt(hoursInput.value) || 0;
        const minutes = parseInt(minutesInput.value) || 0;
        const totalMinutes = (hours * 60) + minutes;
        if (totalMinutes <= 0) {
            console.warn("⚠️ Ingresa un tiempo válido.");
            return;
        }
        ipcRenderer.send("set-playtime", { gameName: currentGameForTimer, minutes: totalMinutes });
        closeTimerModal();
    };

    cancelTimerBtn.onclick = () => closeTimerModal();

    timerModal.onclick = (e) => {
        if (e.target === timerModal) closeTimerModal();
    };
}

function closeTimerModal(){
    const timerModal = document.getElementById("timerModal");
    if (!timerModal) return;
    timerModal.classList.remove('is-open');
    timerModal.style.display = 'none';
    timerModal.setAttribute('aria-hidden', 'true');
    modalOpen = false;
}

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalOpen) closeTimerModal();
});

// ==================== Lista de juegos ====================
const gameListContainer = document.getElementById('gameListContainer');
let activeGames = {};

function renderGames() {
    gameListContainer.innerHTML = '';

    const now = Date.now();
    const gameEntries = Object.entries(activeGames);

    if (gameEntries.length === 0) {
        const noGamesMessage = document.createElement('p');
        noGamesMessage.textContent = 'No se encontraron juegos activos.';
        gameListContainer.appendChild(noGamesMessage);
        return;
    }

    gameEntries.forEach(([gameName, start]) => {
        const elapsedSeconds = Math.floor((now - start) / 1000);
        const friendlyName = gameName.replace('.exe', '');

        const hours = Math.floor(elapsedSeconds / 3600);
        const minutes = Math.floor((elapsedSeconds % 3600) / 60);
        const seconds = elapsedSeconds % 60;
        const timeFormatted = `${hours}h ${minutes}m ${seconds}s`;

        const gameElement = document.createElement('div');
        gameElement.classList.add('game-item');
        gameElement.dataset.game = gameName;
        gameElement.innerHTML = `
      <div>
        <strong>${friendlyName}</strong> - Jugando<br>
        ⏱ Sesión: ${timeFormatted}
        <button class="block-button" data-action="block" data-game="${gameName}">Bloquear</button>
        <button class="timer-button" data-action="timer" data-game="${gameName}" data-friendly="${friendlyName}">Establecer tiempo</button>
      </div>
    `;
        gameListContainer.appendChild(gameElement);
    });
}

gameListContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    const action = btn.getAttribute('data-action');
    const gameName = btn.getAttribute('data-game');

    if (action === 'block' && gameName) {
        ipcRenderer.send('block-game', gameName);
        return;
    }

    if (action === 'timer' && gameName) {
        const friendly = btn.getAttribute('data-friendly') || gameName.replace('.exe','');
        openTimerModal(gameName, friendly);
        return;
    }
});

ipcRenderer.on('game-closed', (_e, { name, by }) => {
    console.log(`Juego cerrado (${by}): ${name}`);
});

setInterval(renderGames, 1000);

ipcRenderer.on('update-game-list', (_event, games) => {
    activeGames = {};
    games.forEach(g => activeGames[g.name] = g.start);
    renderGames();
});

ipcRenderer.on('game-blocked', (_event, result) => console.log(result.message));
ipcRenderer.on('playtime-set', (_event, { gameName, minutes }) => console.log(`Tiempo para ${gameName}: ${minutes} min.`));
ipcRenderer.on('time-up', (_event, gameName) => console.log(`Tiempo agotado para ${gameName}.`));
ipcRenderer.on('game-unblocked', (_event, gameName) => { console.log(`${gameName} desbloqueado.`); renderGames(); });