// renderer.js
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

    // Logout
    logoutBtn && logoutBtn.addEventListener('click', async () => {
        try {
            await ipcRenderer.invoke('auth:logout');
        } finally {
            closeDrawer();
            location.replace('login.html');
        }
    });
});

// ==================== Timer Modal (auto-inyección si falta) ====================
let currentGameForTimer = null;
let modalOpen = false;

function ensureTimerModal() {
    let timerModal = document.getElementById('timerModal');
    if (timerModal) return timerModal;

    // Crear modal dinámicamente si no existe
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

    // Mostrar modal
    timerModal.classList.add('is-open');
    timerModal.style.display = ''; // lo maneja .is-open en CSS
    timerModal.setAttribute('aria-hidden', 'false');
    modalOpen = true;

    // Evitar handlers duplicados reasignando onclick
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

    // Cerrar si clic afuera
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

// Cerrar modal con ESC
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

// Delegación de eventos (un solo listener para toda la lista)
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

// Re-render cada segundo (solo contenido)
setInterval(renderGames, 1000);

ipcRenderer.on('update-game-list', (_event, games) => {
    activeGames = {};
    games.forEach(g => activeGames[g.name] = g.start);
    renderGames();
});

// Logs opcionales (overlay ya lo muestra desde main)
ipcRenderer.on('game-blocked', (_event, result) => console.log(result.message));
ipcRenderer.on('playtime-set', (_event, { gameName, minutes }) => console.log(`Tiempo para ${gameName}: ${minutes} min.`));
ipcRenderer.on('time-up', (_event, gameName) => console.log(`Tiempo agotado para ${gameName}.`));
ipcRenderer.on('game-unblocked', (_event, gameName) => { console.log(`${gameName} desbloqueado.`); renderGames(); });
