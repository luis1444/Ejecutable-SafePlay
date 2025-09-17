const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
    const gameListContainer = document.getElementById('gameListContainer');
    const timerModal = document.getElementById("timerModal");
    const modalGameName = document.getElementById("modalGameName");
    const hoursInput = document.getElementById("hoursInput");
    const minutesInput = document.getElementById("minutesInput");
    const confirmTimerBtn = document.getElementById("confirmTimerBtn");
    const cancelTimerBtn = document.getElementById("cancelTimerBtn");

    let currentGameForTimer = null;
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
            gameElement.innerHTML = `
                <div>
                    <strong>${friendlyName}</strong> - Jugando<br>
                    ⏱ Sesión: ${timeFormatted}
                    <button class="block-button">Bloquear</button>
                    <button class="timer-button">Establecer tiempo</button>
                </div>
            `;

            const blockButton = gameElement.querySelector('.block-button');
            const timerButton = gameElement.querySelector('.timer-button');

            blockButton.addEventListener('click', () => {
                ipcRenderer.send('block-game', gameName);
            });

            timerButton.addEventListener('click', () => {
                currentGameForTimer = gameName;
                modalGameName.textContent = `Juego: ${friendlyName}`;
                hoursInput.value = "";
                minutesInput.value = "";
                timerModal.style.display = "block";
            });

            gameListContainer.appendChild(gameElement);
        });
    }

    // Actualiza tiempos cada segundo
    setInterval(renderGames, 1000);

    ipcRenderer.on('update-game-list', (event, games) => {
        activeGames = {};
        games.forEach(g => activeGames[g.name] = g.start);
        renderGames();
    });

    confirmTimerBtn.addEventListener("click", () => {
        const hours = parseInt(hoursInput.value) || 0;
        const minutes = parseInt(minutesInput.value) || 0;
        const totalMinutes = (hours * 60) + minutes;
        if (totalMinutes <= 0) {
            alert("⚠️ Ingresa un tiempo válido.");
            return;
        }
        ipcRenderer.send("set-playtime", { gameName: currentGameForTimer, minutes: totalMinutes });
        alert(`⏱️ Tiempo establecido: ${totalMinutes} min`);
        timerModal.style.display = "none";
    });

    cancelTimerBtn.addEventListener("click", () => {
        timerModal.style.display = "none";
    });

    window.onclick = (event) => {
        if (event.target === timerModal) timerModal.style.display = "none";
    };

    ipcRenderer.on('game-blocked', (event, result) => {
        alert(result.message);
    });

    ipcRenderer.on("time-up", (event, gameName) => {
        alert(`⏰ Tiempo terminado para ${gameName}, juego cerrado.`);
    });
});
