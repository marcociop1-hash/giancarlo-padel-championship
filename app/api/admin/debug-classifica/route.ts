// app/api/admin/debug-classifica/route.ts
import { NextResponse } from "next/server";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function initAdmin() {
  if (!getApps().length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    if (!projectId || !clientEmail || !privateKey) {
      throw new Error("Mancano FIREBASE_* in .env.local");
    }
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  return getFirestore();
}

export async function GET() {
  try {
    const db = initAdmin();
    
    // Simula esattamente quello che fa l'API classifica
    const snap = await db
      .collection('matches')
      .where('status', '==', 'completed')
      .get();

    const matches = snap.docs.map(doc => doc.data());
    
    // Debug dettagliato delle partite trovate
    console.log('Partite completate trovate:', matches.length);
    matches.forEach((match, index) => {
      console.log(`Partita ${index + 1}:`, {
        id: match.id,
        teamA: match.teamA?.map(p => ({ id: p.id, name: p.name })),
        teamB: match.teamB?.map(p => ({ id: p.id, name: p.name })),
        scoreA: match.scoreA,
        scoreB: match.scoreB,
        status: match.status
      });
    });
    
    // Testa anche il fallback
    const allMatches = await db.collection('matches').get();
    const matchesWithScore = allMatches.docs.filter(doc => {
      const data = doc.data();
      return data.scoreA !== undefined && data.scoreB !== undefined && 
             typeof data.scoreA === 'number' && typeof data.scoreB === 'number' &&
             (data.scoreA > 0 || data.scoreB > 0);
    });
    
    return NextResponse.json({
      ok: true,
      summary: {
        completedByStatus: matches.length,
        withValidScores: matchesWithScore.length,
        allMatches: allMatches.size
      },
      completedMatches: matches.map(m => ({
        id: m.id,
        teamA: m.teamA?.map(p => ({ id: p.id, name: p.name })),
        teamB: m.teamB?.map(p => ({ id: p.id, name: p.name })),
        scoreA: m.scoreA,
        scoreB: m.scoreB,
        status: m.status
      })),
      matchesWithScores: matchesWithScore.map(doc => {
        const m = doc.data();
        return {
          id: doc.id,
          teamA: m.teamA?.map(p => ({ id: p.id, name: p.name })),
          teamB: m.teamB?.map(p => ({ id: p.id, name: p.name })),
          scoreA: m.scoreA,
          scoreB: m.scoreB,
          status: m.status
        };
      })
    });
  } catch (error: any) {
    console.error("ERRORE /api/admin/debug-classifica:", error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}



