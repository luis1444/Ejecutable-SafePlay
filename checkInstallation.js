// checkInstallation.js - Verificar que todos los archivos estén correctos
const fs = require('fs');
const path = require('path');

console.log('🔍 Verificando instalación de SafePlay...\n');

const requiredFiles = [
    { file: 'main.js', required: true, desc: 'Archivo principal de Electron' },
    { file: 'renderer.js', required: true, desc: 'Lógica del frontend' },
    { file: 'authService.js', required: true, desc: 'Servicio de autenticación' },
    { file: 'apiService.js', required: true, desc: 'Servicio de API' },
    { file: 'commandExecutor.js', required: true, desc: 'Ejecutor de comandos' },
    { file: 'index.html', required: true, desc: 'Interfaz principal' },
    { file: 'login.html', required: true, desc: 'Pantalla de login' },
    { file: 'overlay.html', required: true, desc: 'Overlay de notificaciones' },
    { file: 'processProtector.js', required: false, desc: 'Protección del proceso (opcional)' },
    { file: 'securityConfig.js', required: false, desc: 'Configuración de seguridad (opcional)' },
    { file: 'package.json', required: true, desc: 'Configuración de npm' }
];

const optionalDirs = [
    { dir: 'assets', desc: 'Recursos (iconos, imágenes)' }
];

let allGood = true;
let warnings = [];

console.log('📁 Verificando archivos:\n');

requiredFiles.forEach(({ file, required, desc }) => {
    const exists = fs.existsSync(path.join(__dirname, file));

    if (exists) {
        console.log(`✅ ${file.padEnd(25)} - ${desc}`);
    } else if (required) {
        console.log(`❌ ${file.padEnd(25)} - FALTA (${desc})`);
        allGood = false;
    } else {
        console.log(`⚠️  ${file.padEnd(25)} - OPCIONAL (${desc})`);
        warnings.push(file);
    }
});

console.log('\n📂 Verificando directorios:\n');

optionalDirs.forEach(({ dir, desc }) => {
    const exists = fs.existsSync(path.join(__dirname, dir));

    if (exists) {
        console.log(`✅ ${dir.padEnd(25)} - ${desc}`);
    } else {
        console.log(`⚠️  ${dir.padEnd(25)} - OPCIONAL (${desc})`);
    }
});

console.log('\n🔍 Verificando contenido de archivos clave:\n');

// Verificar que main.js tenga las importaciones correctas
try {
    const mainContent = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');

    if (mainContent.includes('show-password-dialog')) {
        console.log('✅ main.js - Sistema de contraseña detectado');
    } else {
        console.log('⚠️  main.js - Sistema de contraseña no detectado');
        warnings.push('main.js puede no tener las protecciones de seguridad');
    }

    if (mainContent.includes('securityConfig')) {
        console.log('✅ main.js - Configuración de seguridad integrada');
    } else {
        console.log('⚠️  main.js - Sin referencia a securityConfig');
    }
} catch (err) {
    console.log('❌ No se pudo leer main.js');
    allGood = false;
}

// Verificar authService.js
try {
    const authContent = fs.readFileSync(path.join(__dirname, 'authService.js'), 'utf8');

    if (authContent.includes('verifyCredentials')) {
        console.log('✅ authService.js - Función verifyCredentials presente');
    } else {
        console.log('❌ authService.js - Falta función verifyCredentials');
        allGood = false;
    }
} catch (err) {
    console.log('❌ No se pudo leer authService.js');
    allGood = false;
}

// Verificar renderer.js
try {
    const rendererContent = fs.readFileSync(path.join(__dirname, 'renderer.js'), 'utf8');

    if (rendererContent.includes('passwordModal')) {
        console.log('✅ renderer.js - Modal de contraseña presente');
    } else {
        console.log('❌ renderer.js - Falta modal de contraseña');
        allGood = false;
    }
} catch (err) {
    console.log('❌ No se pudo leer renderer.js');
    allGood = false;
}

// Verificar index.html
try {
    const htmlContent = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

    if (htmlContent.includes('password-modal')) {
        console.log('✅ index.html - Estilos del modal de contraseña presentes');
    } else {
        console.log('⚠️  index.html - Puede faltar estilos del modal');
        warnings.push('index.html puede necesitar actualización de estilos');
    }
} catch (err) {
    console.log('❌ No se pudo leer index.html');
    allGood = false;
}

console.log('\n' + '='.repeat(60) + '\n');

if (allGood && warnings.length === 0) {
    console.log('✅ ¡INSTALACIÓN COMPLETA! Todo está en orden.\n');
    console.log('Puedes ejecutar la aplicación con: npm start\n');
} else if (allGood && warnings.length > 0) {
    console.log('⚠️  INSTALACIÓN FUNCIONAL con advertencias\n');
    console.log('Advertencias:');
    warnings.forEach(w => console.log(`   - ${w}`));
    console.log('\nPuedes ejecutar la aplicación, pero algunas funciones opcionales pueden no estar disponibles.\n');
} else {
    console.log('❌ INSTALACIÓN INCOMPLETA\n');
    console.log('Hay archivos requeridos faltantes. Por favor, asegúrate de tener todos los archivos necesarios.\n');
}

console.log('📝 Notas:');
console.log('   - processProtector.js y securityConfig.js son opcionales');
console.log('   - Si faltan, la app usará configuración por defecto');
console.log('   - Para máxima seguridad, se recomienda crear estos archivos\n');

console.log('🔐 Estado de seguridad:');
if (fs.existsSync(path.join(__dirname, 'processProtector.js')) &&
    fs.existsSync(path.join(__dirname, 'securityConfig.js'))) {
    console.log('   ✅ Protección MÁXIMA - Todos los módulos de seguridad presentes');
} else if (fs.existsSync(path.join(__dirname, 'processProtector.js')) ||
    fs.existsSync(path.join(__dirname, 'securityConfig.js'))) {
    console.log('   ⚠️  Protección PARCIAL - Algunos módulos de seguridad presentes');
} else {
    console.log('   ⚠️  Protección BÁSICA - Usando configuración por defecto');
}

console.log('\n' + '='.repeat(60));