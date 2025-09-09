const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;  // Puedes cambiar el puerto si es necesario

// Servir los archivos estáticos (por ejemplo, tu página HTML, JS, CSS)
app.use(express.static(path.join(__dirname, 'public')));

// Ruta para cargar la página principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));  // Ajusta el nombre de tu archivo HTML si es necesario
});

// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
