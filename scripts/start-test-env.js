#!/usr/bin/env node

/**
 * Script per avviare l'ambiente di test
 * Usa Firebase Emulator per testare senza toccare il database di produzione
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Avvio ambiente di test...');

// Avvia Firebase Emulator
const firebase = spawn('firebase', ['emulators:start', '--config', 'firebase.test.json'], {
  stdio: 'inherit',
  shell: true
});

firebase.on('error', (err) => {
  console.error('❌ Errore Firebase Emulator:', err);
});

firebase.on('close', (code) => {
  console.log(`Firebase Emulator terminato con codice ${code}`);
});

// Avvia Next.js in modalità test
setTimeout(() => {
  console.log('🌐 Avvio Next.js in modalità test...');
  
  const nextjs = spawn('npm', ['run', 'dev'], {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      FIREBASE_EMULATOR: 'true',
      FIRESTORE_EMULATOR_HOST: 'localhost:8080',
      FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099'
    }
  });

  nextjs.on('error', (err) => {
    console.error('❌ Errore Next.js:', err);
  });

}, 5000);

// Gestisci la chiusura
process.on('SIGINT', () => {
  console.log('\n🛑 Chiusura ambiente di test...');
  firebase.kill();
  process.exit(0);
});
