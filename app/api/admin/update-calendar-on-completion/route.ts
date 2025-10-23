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
    const db = adminDb();
    
    // Ottieni il calendario attuale
    const calendarDoc = await db.collection('pair_calendar').doc('calendar').get();
    if (!calendarDoc.exists) {
      return NextResponse.json({ 
        error: "Calendario non trovato" 
      }, { status: 404 });
    }
    
    const calendar = calendarDoc.data()?.calendar || [];
    
    // Ottieni le partite completate
    const completedMatches = await db.collection('matches')
      .where('phase', '==', 'campionato')
      .where('status', '==', 'completed')
      .get();
    
    // Crea un set delle coppie già giocate
    const usedPairs = new Set<string>();
    
    completedMatches.docs.forEach(doc => {
      const match = doc.data();
      const teamA = match.teamA;
      const teamB = match.teamB;
      
      if (teamA && teamA.length === 2) {
        const key = [teamA[0].name, teamA[1].name].sort().join('-');
        usedPairs.add(key);
      }
      if (teamB && teamB.length === 2) {
        const key = [teamB[0].name, teamB[1].name].sort().join('-');
        usedPairs.add(key);
      }
    });
    
    // Filtra il calendario rimuovendo le coppie già giocate
    const updatedCalendar = calendar.map(day => {
      const filteredPairs = day.pairs.filter(pair => {
        if (pair.teamA && pair.teamA.length === 2) {
          const key = [pair.teamA[0].name, pair.teamA[1].name].sort().join('-');
          return !usedPairs.has(key);
        }
        return true;
      });
      
      return { ...day, pairs: filteredPairs };
    });
    
    // Salva il calendario aggiornato
    await db.collection('pair_calendar').doc('calendar').set({ 
      calendar: updatedCalendar,
      updatedAt: new Date()
    });
    
    return NextResponse.json({
      ok: true,
      message: "Calendario aggiornato con successo!",
      removedPairs: calendar.reduce((sum, day) => sum + day.pairs.length, 0) - 
                   updatedCalendar.reduce((sum, day) => sum + day.pairs.length, 0)
    });

  } catch (error: any) {
    console.error("ERRORE /api/admin/update-calendar-on-completion:", error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}
