const { ipcRenderer } = require('electron');

console.log('renderer.js: Script cargado');

document.addEventListener('DOMContentLoaded', () => {
    console.log('renderer.js: DOMContentLoaded');

    const gameListContainer = document.getElementById('gameListContainer');
    if (!gameListContainer) {
        console.error('renderer.js: Error - gameListContainer no encontrado');
        return;
    }
    console.log('renderer.js: gameListContainer encontrado');

    ipcRenderer.on('update-game-list', (event, games) => {
        console.log('renderer.js: Recibido update-game-list con juegos:', games);

        // limpiar lista
        gameListContainer.innerHTML = '';

        if (!games || games.length === 0) {
            const noGamesMessage = document.createElement('p');
            noGamesMessage.textContent = 'No se encontraron juegos activos.';
            gameListContainer.appendChild(noGamesMessage);
            return;
        }

        games.forEach(gameName => {
            console.log(`renderer.js: Procesando juego: ${gameName}`);

            const gameElement = document.createElement('div');
            gameElement.classList.add('game-item');

            // Nombre más amigable (quita extensión .exe si existe)
            const friendlyName = gameName.replace('.exe', '');

            gameElement.innerHTML = `
                <div>
                    <strong>${friendlyName}</strong> - Jugando
                    <button class="block-button">Bloquear Juego</button>
                </div>
            `;

            // botón bloquear
            const blockButton = gameElement.querySelector('.block-button');
            if (blockButton) {
                blockButton.addEventListener('click', () => {
                    console.log(`renderer.js: Bloqueando juego: ${gameName}`);
                    ipcRenderer.send('block-game', gameName);
                });
            }

            gameListContainer.appendChild(gameElement);
            console.log(`renderer.js: Añadido ${gameName} al DOM`);
        });
    });
});
