const fs = require('fs');
const path = require('path');

const files = ['installer_sidebar.bmp', 'uninstaller_sidebar.bmp'];

files.forEach(file => {
    const filePath = path.join(__dirname, 'assets', file);

    if (fs.existsSync(filePath)) {
        const buffer = fs.readFileSync(filePath);
        const width = buffer.readUInt32LE(18);
        const height = buffer.readUInt32LE(22);
        const bitsPerPixel = buffer.readUInt16LE(28);

        console.log(`📄 ${file}:`);
        console.log(`   Dimensiones: ${width} x ${height}`);
        console.log(`   Bits por píxel: ${bitsPerPixel}`);

        if (width !== 164 || height !== 314) {
            console.log(`   ❌ ERROR: Debe ser 164 x 314`);
        }
        if (bitsPerPixel !== 24) {
            console.log(`   ⚠️  Advertencia: Debería ser 24 bits (no ${bitsPerPixel})`);
        }
        console.log('');
    } else {
        console.log(`❌ ${file} no encontrado`);
    }
});