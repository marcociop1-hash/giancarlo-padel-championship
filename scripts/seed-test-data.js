#!/usr/bin/env node

/**
 * Script per popolare l'emulatore Firebase con dati di test
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Configurazione per l'emulatore
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

// Inizializza Firebase Admin (per l'emulatore)
const app = initializeApp({
  projectId: 'test-project'
});

const db = getFirestore(app);

async function seedTestData() {
  console.log('🌱 Popolamento dati di test...');

  try {
    // Dati di test - Giornata 1
    const testMatches = [
      {
        teamA: [{ id: 'test-bobo', name: 'Bobo' }, { id: 'test-tommit', name: 'TommiT' }],
        teamB: [{ id: 'test-leo', name: 'Leo' }, { id: 'test-mattia', name: 'Mattia' }],
        scoreA: 3, scoreB: 0, matchday: 1, phase: 'campionato', status: 'completed',
        set1Games: [6,1], set2Games: [6,2], set3Games: [6,2], totalGamesA: 18, totalGamesB: 5,
        date: '2024-01-15', time: '10:00', place: 'Campo 1'
      },
      {
        teamA: [{ id: 'test-nico', name: 'Nico' }, { id: 'test-dani', name: 'Dani' }],
        teamB: [{ id: 'test-matte', name: 'Matte' }, { id: 'test-tommyb', name: 'TommyB' }],
        scoreA: 2, scoreB: 1, matchday: 1, phase: 'campionato', status: 'completed',
        set1Games: [5,7], set2Games: [6,2], set3Games: [6,2], totalGamesA: 17, totalGamesB: 11,
        date: '2024-01-15', time: '11:00', place: 'Campo 2'
      },
      {
        teamA: [{ id: 'test-ivan', name: 'Ivan' }, { id: 'test-gianlu', name: 'Gianlu' }],
        teamB: [{ id: 'test-magro', name: 'Magro' }, { id: 'test-checco', name: 'Checco' }],
        scoreA: 1, scoreB: 2, matchday: 1, phase: 'campionato', status: 'completed',
        set1Games: [6,1], set2Games: [0,6], set3Games: [4,6], totalGamesA: 10, totalGamesB: 13,
        date: '2024-01-15', time: '12:00', place: 'Campo 1'
      },
      {
        teamA: [{ id: 'test-marco', name: 'Marco' }, { id: 'test-giacomo', name: 'Giacomo' }],
        teamB: [{ id: 'test-gabri', name: 'Gabri' }, { id: 'test-gelli', name: 'Gelli' }],
        scoreA: 2, scoreB: 1, matchday: 1, phase: 'campionato', status: 'completed',
        set1Games: [6,2], set2Games: [3,6], set3Games: [7,6], totalGamesA: 16, totalGamesB: 14,
        date: '2024-01-15', time: '13:00', place: 'Campo 2'
      }
    ];

    // Cancella dati esistenti
    console.log('🧹 Pulizia dati esistenti...');
    const existingMatches = await db.collection('matches').get();
    const batch = db.batch();
    existingMatches.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    // Aggiungi dati di test
    console.log('📝 Aggiunta partite di test...');
    for (const match of testMatches) {
      await db.collection('matches').add({
        ...match,
        createdAt: new Date(),
        completedAt: new Date()
      });
    }

    console.log('✅ Dati di test caricati con successo!');
    console.log('🔗 Emulatore disponibile su: http://localhost:4000');
    console.log('🌐 App disponibile su: http://localhost:3001');

  } catch (error) {
    console.error('❌ Errore durante il caricamento dei dati:', error);
  }
}

seedTestData();
