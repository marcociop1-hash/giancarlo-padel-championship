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
    console.log('=== GENERAZIONE CALENDARIO SEMPLICE ===');
    
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
    
    // 2. Ottieni le partite esistenti per la giornata 2
    const matchesSnapshot = await db.collection('matches')
      .where('status', '==', 'completed')
      .where('phase', '==', 'campionato')
      .get();
    
    const allMatches = matchesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as any[];
    
    // Filtra solo le partite del campionato
    const existingMatches = allMatches.filter(match => 
      match.phase === 'campionato' && match.status === 'completed'
    );
    
    console.log(`Trovate ${existingMatches.length} partite esistenti del campionato`);
    
    // 3. Crea il calendario con le coppie esatte
    const calendar: any[] = [];
    
    // Giornata 1 - Coppie esatte fornite
    const giornata1 = {
      day: 1,
      pairs: [
        { teamA: findPlayers(['Marco', 'Giacomo'], players), teamB: [] },
        { teamA: findPlayers(['Gabri', 'Gelli'], players), teamB: [] },
        { teamA: findPlayers(['Ivan', 'Gianlu'], players), teamB: [] },
        { teamA: findPlayers(['Magro', 'Checco'], players), teamB: [] },
        { teamA: findPlayers(['Nico', 'Dani'], players), teamB: [] },
        { teamA: findPlayers(['Matte', 'TommyB'], players), teamB: [] },
        { teamA: findPlayers(['Bobo', 'TommiT'], players), teamB: [] },
        { teamA: findPlayers(['Leo', 'Mattia'], players), teamB: [] }
      ]
    };
    calendar.push(giornata1);
    
    // Giornata 2 - Dalle partite esistenti
    const giornata2Matches = existingMatches.filter(m => m.matchday === 2);
    if (giornata2Matches.length > 0) {
      const giornata2 = {
        day: 2,
        pairs: giornata2Matches.map(match => ({
          teamA: match.teamA || [],
          teamB: match.teamB || []
        }))
      };
      calendar.push(giornata2);
    }
    
    // 4. Salva il calendario nel database
    await db.collection('pair_calendar').doc('calendar').set({
      calendar,
      totalDays: calendar.length,
      generatedAt: new Date(),
      status: 'active',
      type: 'simple'
    });
    
    console.log('=== CALENDARIO SEMPLICE SALVATO ===');
    
    return NextResponse.json({
      ok: true,
      message: `Calendario semplice generato! ${calendar.length} giornate create.`,
      totalDays: calendar.length,
      calendar: calendar.map((day, index) => ({
        day: day.day,
        pairs: day.pairs.map(pair => ({
          teamA: pair.teamA.map(p => p.name).join(' + '),
          teamB: pair.teamB.map(p => p.name).join(' + ')
        }))
      }))
    });
    
  } catch (error: any) {
    console.error("ERRORE /api/admin/generate-simple-calendar:", error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}

function findPlayers(names: string[], players: any[]) {
  return names.map(name => {
    const player = players.find(p => p.name === name);
    if (!player) {
      console.warn(`Giocatore non trovato: ${name}`);
      return { id: null, name };
    }
    return player;
  });
}
