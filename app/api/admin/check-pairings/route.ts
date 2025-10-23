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
  try {
    const db = adminDb();
    
    // Ottieni il calendario
    const calendarDoc = await db.collection('pair_calendar').doc('calendar').get();
    if (!calendarDoc.exists) {
      return NextResponse.json({ 
        error: "Calendario non trovato" 
      }, { status: 404 });
    }
    
    const calendar = calendarDoc.data()?.calendar || [];
    
    // Analizza solo i compagni (teammates), non gli avversari
    const teammatePairs = new Map<string, number>();
    const duplicates: string[] = [];
    
    calendar.forEach((day: any) => {
      day.pairs.forEach((pair: any) => {
        if (pair.teamA && pair.teamA.length === 2) {
          // Crea una chiave unica per la coppia di compagni (ordinata)
          const teammateKey = [pair.teamA[0].id, pair.teamA[1].id].sort().join('-');
          
          if (teammatePairs.has(teammateKey)) {
            teammatePairs.set(teammateKey, teammatePairs.get(teammateKey)! + 1);
            if (!duplicates.includes(teammateKey)) {
              duplicates.push(teammateKey);
            }
          } else {
            teammatePairs.set(teammateKey, 1);
          }
        }
      });
    });
    
    const totalPairs = calendar.reduce((sum: number, day: any) => sum + day.pairs.length, 0);
    const uniqueTeammatePairs = teammatePairs.size;
    const duplicateCount = duplicates.length;
    
    return NextResponse.json({
      ok: true,
      message: `Analisi completata! Controllati solo i compagni (teammates).`,
      stats: {
        totalDays: calendar.length,
        totalPairs,
        uniqueTeammatePairs,
        duplicates: duplicateCount,
        isValid: duplicateCount === 0
      },
      duplicates: duplicates.map(key => {
        const [id1, id2] = key.split('-');
        return {
          teammateKey: key,
          count: teammatePairs.get(key),
          player1Id: id1,
          player2Id: id2
        };
      })
    });
    
  } catch (error: any) {
    console.error("ERRORE /api/admin/check-pairings:", error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}
