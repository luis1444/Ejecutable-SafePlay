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
        try {
            gameListContainer.innerHTML = ''; // Limpiar la lista
            console.log('renderer.js: Contenedor limpiado');

            if (games.length === 0) {
                console.log('renderer.js: No se encontraron juegos');
                const noGamesMessage = document.createElement('p');
                noGamesMessage.textContent = 'No se encontraron juegos activos.';
                gameListContainer.appendChild(noGamesMessage);
                return;
            }

            games.forEach(gameName => {
                console.log(`renderer.js: Procesando juego: ${gameName}`);
                const gameElement = document.createElement('div');
                gameElement.classList.add('game-item');
                const friendlyName = gameName.replace('.exe', ''); // Nombre más limpio
                gameElement.innerHTML = `
                    <div>
                        ${friendlyName} - Jugando
                        <button class="block-button">Bloquear Juego</button>
                    </div>
                `;

                const blockButton = gameElement.querySelector('.block-button');
                if (blockButton) {
                    blockButton.addEventListener('click', () => {
                        console.log(`renderer.js: Bloqueando juego: ${gameName}`);
                        ipcRenderer.send('block-game', gameName);
                    });
                } else {
                    console.error(`renderer.js: Botón no encontrado para ${gameName}`);
                }

                gameListContainer.appendChild(gameElement);
                console.log(`renderer.js: Añadido ${gameName} al DOM`);
            });
        } catch (error) {
            console.error('renderer.js: Error al procesar juegos:', error);
        }
    });
});
