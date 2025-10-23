import { NextResponse } from "next/server";
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function adminDb() {
  if (!getApps().length) {
    const projectId = process.env.FIREBASE_PROJECT_ID!;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL!;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n');
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  return getFirestore();
}

export async function POST() {
  try {
    console.log('=== GENERAZIONE CALENDARIO COMPLETO INIZIATA ===');
    
    const db = adminDb();
    
    // 1. Ottieni tutti i giocatori
    const playersSnapshot = await db.collection('players').get();
    if (playersSnapshot.empty) {
      return NextResponse.json({
        error: 'Nessun giocatore trovato'
      }, { status: 400 });
    }
    
    const players = playersSnapshot.docs.map(doc => ({
      id: doc.id,
      name: doc.data().name
    }));
    
    console.log(`Trovati ${players.length} giocatori:`, players.map(p => p.name));
    
    if (players.length !== 16) {
      return NextResponse.json({
        error: `Numero giocatori errato: ${players.length}. Attesi 16.`
      }, { status: 400 });
    }
    
    // 2. Ottieni le partite esistenti
    const matchesSnapshot = await db.collection('matches')
      .where('status', '==', 'completed')
      .get();
    
    const allMatches = matchesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Filtra solo le partite del campionato
    const existingMatches = allMatches.filter(match => 
      match.phase === 'campionato' && match.status === 'completed'
    );
    
    console.log(`Trovate ${existingMatches.length} partite esistenti del campionato`);
    
    // 3. Analizza gli accoppiamenti esistenti
    const usedPairs = new Set<string>();
    const existingPairings = [];
    
    existingMatches.forEach(match => {
      if (match.teamA && match.teamB && match.teamA.length === 2 && match.teamB.length === 2) {
        // Coppia team A
        const pairA = [match.teamA[0].id, match.teamA[1].id].sort().join('-');
        const pairB = [match.teamB[0].id, match.teamB[1].id].sort().join('-');
        
        existingPairings.push({
          matchday: match.matchday,
          teamA: {
            players: [match.teamA[0].name, match.teamA[1].name],
            ids: [match.teamA[0].id, match.teamA[1].id]
          },
          teamB: {
            players: [match.teamB[0].name, match.teamB[1].name],
            ids: [match.teamB[0].id, match.teamB[1].id]
          }
        });
        
        usedPairs.add(pairA);
        usedPairs.add(pairB);
      }
    });
    
    console.log(`Accoppiamenti esistenti: ${usedPairs.size}`);
    
    // 4. Genera il calendario completo
    const calendar = generateCompleteCalendar(players, existingPairings, usedPairs);
    
    // 5. Salva il calendario nel database
    await db.collection('pair_calendar').doc('calendar').set({
      calendar,
      totalDays: calendar.length,
      generatedAt: new Date(),
      status: 'active',
      includesExisting: true
    });
    
    console.log('=== CALENDARIO COMPLETO SALVATO NEL DATABASE ===');
    
    return NextResponse.json({
      ok: true,
      message: `Calendario completo generato! ${calendar.length} giornate create.`,
      totalDays: calendar.length,
      existingDays: existingPairings.length,
      newDays: calendar.length - existingPairings.length,
      calendar: calendar.map((day, index) => ({
        day: index + 1,
        pairs: day.pairs.map(pair => ({
          teamA: pair.teamA.map(p => p.name).join(' + '),
          teamB: pair.teamB.map(p => p.name).join(' + ')
        }))
      }))
    });
    
  } catch (error: any) {
    console.error("ERRORE /api/admin/generate-complete-calendar:", error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}

function generateCompleteCalendar(players: any[], existingPairings: any[], usedPairs: Set<string>) {
  const calendar = [];
  
  // Aggiungi le giornate esistenti
  existingPairings.forEach(pairing => {
    calendar.push({
      day: pairing.matchday,
      pairs: [{
        teamA: pairing.teamA.ids.map(id => players.find(p => p.id === id)).filter(Boolean),
        teamB: pairing.teamB.ids.map(id => players.find(p => p.id === id)).filter(Boolean)
      }]
    });
  });
  
  // Genera le giornate rimanenti (3-15)
  const maxDay = Math.max(...existingPairings.map(p => p.matchday), 0);
  const remainingDays = 15 - maxDay;
  
  console.log(`Giornate esistenti: ${maxDay}, Giornate da generare: ${remainingDays}`);
  
  // Genera tutte le possibili coppie
  const allPossiblePairs = [];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      allPossiblePairs.push([players[i], players[j]]);
    }
  }
  
  console.log(`Totale coppie possibili: ${allPossiblePairs.length}`);
  
  // Mescola le coppie per randomizzazione
  shuffleArray(allPossiblePairs);
  
  // Genera le giornate rimanenti
  for (let day = maxDay + 1; day <= 15; day++) {
    console.log(`Generando giornata ${day}...`);
    
    const dayPairs = generateDayPairsFromAvailable(allPossiblePairs, usedPairs, day);
    
    if (dayPairs.length < 4) {
      console.log(`⚠️ Giornata ${day}: Solo ${dayPairs.length} coppie trovate`);
    }
    
    calendar.push({
      day,
      pairs: dayPairs
    });
    
    // Aggiungi le coppie usate al set
    dayPairs.forEach(pair => {
      const pairKey = `${pair.teamA[0].id}-${pair.teamA[1].id}`;
      usedPairs.add(pairKey);
    });
    
    console.log(`Giornata ${day} completata: ${dayPairs.length} coppie`);
  }
  
  return calendar;
}

function generateDayPairsFromAvailable(allPossiblePairs: any[][], usedPairs: Set<string>, day: number) {
  const pairs = [];
  const usedPlayers = new Set<string>();
  
  // Trova 4 partite (8 coppie) non usate per questa giornata
  for (const pair of allPossiblePairs) {
    if (pairs.length >= 4) break; // Massimo 4 partite per giornata (16 giocatori)
    
    const player1 = pair[0];
    const player2 = pair[1];
    const pairKey = `${player1.id}-${player2.id}`;
    
    // Controlla se la coppia è già stata usata
    if (usedPairs.has(pairKey)) continue;
    
    // Controlla se i giocatori sono già stati usati in questa giornata
    if (usedPlayers.has(player1.id) || usedPlayers.has(player2.id)) continue;
    
    // Aggiungi la coppia
    pairs.push({
      teamA: [player1, player2],
      teamB: [] // Sarà assegnato dall'algoritmo di generazione partite
    });
    
    // Marca i giocatori come usati in questa giornata
    usedPlayers.add(player1.id);
    usedPlayers.add(player2.id);
  }
  
  return pairs;
}

function shuffleArray(array: any[]) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}
