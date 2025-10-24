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

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/admin/generate-pair-calendar",
    usage: "POST -> Genera il calendario completo delle coppie per le prossime 13 giornate."
  });
}

export async function POST() {
  try {
    console.log('=== GENERAZIONE CALENDARIO COPPIE INIZIATA ===');
    
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
    
    // 2. Genera il calendario completo (13 giornate)
    const calendar = generatePairCalendar(players);
    
    // 3. Salva il calendario nel database
    await db.collection('pair_calendar').doc('calendar').set({
      calendar,
      totalDays: 13,
      generatedAt: new Date(),
      status: 'active'
    });
    
    console.log('=== CALENDARIO SALVATO NEL DATABASE ===');
    
    return NextResponse.json({
      ok: true,
      message: `Calendario generato con successo! 13 giornate create.`,
      totalDays: 13,
      calendar: calendar.map((day, index) => ({
        day: index + 1,
        pairs: day.pairs.map(pair => ({
          teamA: pair.teamA.map(p => p.name).join(' + '),
          teamB: pair.teamB.map(p => p.name).join(' + ')
        }))
      }))
    });
    
  } catch (error: any) {
    console.error("ERRORE /api/admin/generate-pair-calendar:", error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}

function generatePairCalendar(players: any[]) {
  const calendar: any[] = [];
  const usedPairs = new Set<string>();
  
  // Genera tutte le possibili coppie
  const allPossiblePairs: any[] = [];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      allPossiblePairs.push([players[i], players[j]]);
    }
  }
  
  console.log(`Totale coppie possibili: ${allPossiblePairs.length}`);
  
  // Mescola le coppie per randomizzazione
  shuffleArray(allPossiblePairs);
  
  // Genera 13 giornate
  for (let day = 1; day <= 13; day++) {
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
  const pairs: any[] = [];
  const usedPlayers = new Set<string>();
  
  // Trova 4 coppie non usate per questa giornata
  for (const pair of allPossiblePairs) {
    if (pairs.length >= 4) break; // Massimo 4 coppie per giornata
    
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
