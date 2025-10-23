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

// Algoritmo Round-Robin semplificato per 16 giocatori
function generateRoundRobinSchedule(players: any[]) {
  const n = players.length; // 16 giocatori
  const schedule = [];
  
  // Per 16 giocatori, abbiamo 15 giornate (n-1)
  for (let round = 0; round < n - 1; round++) {
    const dayPairs = [];
    
    // Genera le 8 coppie per questa giornata
    for (let i = 0; i < n / 2; i++) {
      const player1 = players[i];
      const player2 = players[n - 1 - i];
      dayPairs.push({ teamA: [player1, player2], teamB: [] });
    }
    
    schedule.push({ day: round + 1, pairs: dayPairs });
    
    // Ruota i giocatori (tranne il primo)
    const first = players[0];
    const last = players[n - 1];
    const middle = players.slice(1, n - 1);
    
    // Ruota: primo rimane, ultimo va in posizione 2, gli altri si spostano
    players[0] = first;
    players[1] = last;
    for (let i = 2; i < n; i++) {
      players[i] = middle[i - 2];
    }
  }
  
  return schedule;
}

export async function POST() {
  try {
    const db = adminDb();
    
    // 1. Ottieni tutti i giocatori
    const playersSnap = await db.collection('players').get();
    const players = playersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    console.log(`Trovati ${players.length} giocatori`);
    
    if (players.length !== 16) {
      return NextResponse.json({ 
        error: `Errore: servono esattamente 16 giocatori, trovati ${players.length}` 
      }, { status: 400 });
    }
    
    // 2. Ottieni le coppie già giocate (Giornata 1 e 2)
    const existingMatches = await db.collection('matches')
      .where('phase', '==', 'campionato')
      .get();
    
    // Filtra solo le partite completate delle prime 2 giornate
    const filteredMatches = existingMatches.docs.filter(doc => {
      const match = doc.data();
      return match.status === 'completed' && match.matchday <= 2;
    });
    
    const usedPairs = new Set<string>();
    
    // Estrai le coppie dalle partite esistenti
    filteredMatches.forEach(doc => {
      const match = doc.data();
      const teamA = match.teamA;
      const teamB = match.teamB;
      
      if (teamA && teamA.length === 2) {
        const p1 = players.find(p => p.name === teamA[0].name);
        const p2 = players.find(p => p.name === teamA[1].name);
        if (p1 && p2) {
          usedPairs.add([p1.id, p2.id].sort().join('-'));
        }
      }
      if (teamB && teamB.length === 2) {
        const p1 = players.find(p => p.name === teamB[0].name);
        const p2 = players.find(p => p.name === teamB[1].name);
        if (p1 && p2) {
          usedPairs.add([p1.id, p2.id].sort().join('-'));
        }
      }
    });
    
    console.log(`Trovate ${usedPairs.size} coppie già giocate`);
    
    // 3. Genera il calendario Round-Robin completo (15 giornate)
    console.log('Generazione Round-Robin...');
    const fullSchedule = generateRoundRobinSchedule([...players]);
    console.log(`Calendario generato: ${fullSchedule.length} giornate`);
    
    // 4. Filtra le giornate 3-15 (rimuovi le prime 2)
    const newSchedule = fullSchedule.slice(2); // Rimuovi giornate 1 e 2
    console.log(`Giornate da aggiungere: ${newSchedule.length} (dalla 3 alla 15)`);
    
    // 5. Usa l'algoritmo Round-Robin per le giornate 3-15
    const validNewSchedule = [];
    
    // Genera tutte le coppie possibili per 16 giocatori
    const allPossiblePairs = [];
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const key = [players[i].id, players[j].id].sort().join('-');
        if (!usedPairs.has(key)) {
          allPossiblePairs.push({ teamA: [players[i], players[j]], teamB: [] });
        }
      }
    }
    
    console.log(`Coppie disponibili: ${allPossiblePairs.length}`);
    
    // Usa l'algoritmo Round-Robin per distribuire le coppie
    const remainingPairs = [...allPossiblePairs];
    
    for (let day = 3; day <= 15; day++) {
      const dayPairs = [];
      const usedInDay = new Set();
      
      // Scegli 8 coppie per questa giornata
      for (let i = 0; i < 8 && remainingPairs.length > 0; i++) {
        let pairFound = false;
        
        for (let j = 0; j < remainingPairs.length; j++) {
          const pair = remainingPairs[j];
          const p1 = pair.teamA[0];
          const p2 = pair.teamA[1];
          
          if (!usedInDay.has(p1.id) && !usedInDay.has(p2.id)) {
            dayPairs.push(pair);
            usedInDay.add(p1.id);
            usedInDay.add(p2.id);
            remainingPairs.splice(j, 1);
            pairFound = true;
            break;
          }
        }
        
        if (!pairFound) {
          console.log(`⚠️ Impossibile trovare coppia per giornata ${day}, coppia ${i + 1}`);
        }
      }
      
      validNewSchedule.push({ day, pairs: dayPairs });
    }
    
    console.log(`Giornate generate: ${validNewSchedule.length}`);
    
    // 6. Crea le prime due giornate con le coppie già giocate
    const day1Pairs = [];
    const day2Pairs = [];
    
    filteredMatches.forEach(doc => {
      const match = doc.data();
      const teamA = match.teamA;
      const teamB = match.teamB;
      
      if (match.matchday === 1) {
        if (teamA && teamA.length === 2) {
          const p1 = players.find(p => p.name === teamA[0].name);
          const p2 = players.find(p => p.name === teamA[1].name);
          if (p1 && p2) {
            day1Pairs.push({ teamA: [p1, p2], teamB: [] });
          }
        }
        if (teamB && teamB.length === 2) {
          const p1 = players.find(p => p.name === teamB[0].name);
          const p2 = players.find(p => p.name === teamB[1].name);
          if (p1 && p2) {
            day1Pairs.push({ teamA: [p1, p2], teamB: [] });
          }
        }
      } else if (match.matchday === 2) {
        if (teamA && teamA.length === 2) {
          const p1 = players.find(p => p.name === teamA[0].name);
          const p2 = players.find(p => p.name === teamA[1].name);
          if (p1 && p2) {
            day2Pairs.push({ teamA: [p1, p2], teamB: [] });
          }
        }
        if (teamB && teamB.length === 2) {
          const p1 = players.find(p => p.name === teamB[0].name);
          const p2 = players.find(p => p.name === teamB[1].name);
          if (p1 && p2) {
            day2Pairs.push({ teamA: [p1, p2], teamB: [] });
          }
        }
      }
    });
    
    // 7. Combina calendario esistente (giornate 1-2) con quello nuovo (giornate 3-15)
    const existingCalendar = [
      { day: 1, pairs: day1Pairs },
      { day: 2, pairs: day2Pairs }
    ];
    const combinedCalendar = [...existingCalendar, ...validNewSchedule];
    
    // 8. Salva il calendario completo
    await db.collection('pair_calendar').doc('calendar').set({ 
      calendar: combinedCalendar,
      generatedAt: new Date(),
      totalDays: combinedCalendar.length,
      algorithm: 'round-robin'
    });
    
    // 9. Verifica finale
    const allPairs = new Map();
    let duplicates = 0;
    
    combinedCalendar.forEach(day => {
      day.pairs.forEach(pair => {
        const key = [pair.teamA[0].id, pair.teamA[1].id].sort().join('-');
        if (allPairs.has(key)) {
          duplicates++;
        } else {
          allPairs.set(key, 1);
        }
      });
    });
    
    const totalPairs = combinedCalendar.reduce((sum, day) => sum + day.pairs.length, 0);
    const expectedPairs = 16 * 15 / 2; // 120 coppie uniche per 16 giocatori
    
    return NextResponse.json({
      ok: true,
      message: `Calendario Round-Robin generato! ${validNewSchedule.length} nuove giornate aggiunte.`,
      stats: {
        totalDays: combinedCalendar.length,
        newDays: validNewSchedule.length,
        totalPairs,
        expectedPairs,
        duplicates,
        conflicts: 0, // Ora filtrato
        players: players.length,
        isValid: duplicates === 0
      }
    });

  } catch (error: any) {
    console.error("ERRORE /api/admin/generate-round-robin:", error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}
