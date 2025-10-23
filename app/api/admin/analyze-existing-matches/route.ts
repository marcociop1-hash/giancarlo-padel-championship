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
    
    // Ottieni tutte le partite completate
    const matchesSnapshot = await db.collection('matches')
      .where('status', '==', 'completed')
      .where('phase', '==', 'campionato')
      .orderBy('matchday', 'asc')
      .get();
    
    const matches = matchesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Analizza gli accoppiamenti esistenti
    const existingPairings = [];
    const usedPairs = new Set<string>();
    
    matches.forEach(match => {
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
    
    return NextResponse.json({
      ok: true,
      existingMatches: matches.length,
      existingPairings,
      usedPairs: Array.from(usedPairs),
      message: `Analizzati ${matches.length} partite esistenti con ${existingPairings.length} accoppiamenti`
    });
    
  } catch (error: any) {
    console.error("ERRORE /api/admin/analyze-existing-matches:", error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}
