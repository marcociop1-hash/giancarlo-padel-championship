import { NextResponse } from "next/server";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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

export async function POST(req: Request) {
  try {
    const { matchday } = await req.json();
    
    if (matchday === undefined || matchday === null) {
      return NextResponse.json({ 
        error: "Matchday richiesto" 
      }, { status: 400 });
    }

    const db = adminDb();
    
    console.log(`[API] 🗑️  Cancellazione partite della giornata ${matchday}...`);
    
    // Trova tutte le partite della giornata specificata
    const matchesSnapshot = await db.collection('matches')
      .where('matchday', '==', matchday)
      .get();
    
    if (matchesSnapshot.empty) {
      return NextResponse.json({
        success: true,
        message: `Nessuna partita trovata per la giornata ${matchday}`,
        deletedCount: 0
      });
    }
    
    const matchesToDelete = matchesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as any[];
    
    console.log(`[API] 📊 Trovate ${matchesToDelete.length} partite da cancellare`);
    
    // Cancella tutte le partite in batch
    const batch = db.batch();
    matchesToDelete.forEach(match => {
      const matchRef = db.collection('matches').doc(match.id);
      batch.delete(matchRef);
    });
    
    await batch.commit();
    
    console.log(`[API] ✅ Cancellate ${matchesToDelete.length} partite della giornata ${matchday}`);
    
    return NextResponse.json({
      success: true,
      message: `Cancellate ${matchesToDelete.length} partite della giornata ${matchday}`,
      deletedCount: matchesToDelete.length,
      deletedMatches: matchesToDelete.map(m => ({
        id: m.id,
        teamA: m.teamA,
        teamB: m.teamB,
        status: m.status
      }))
    });
    
  } catch (error: any) {
    console.error("[API] ❌ ERRORE /api/admin/delete-matchday:", error);
    return NextResponse.json({ 
      error: error.message || "Errore interno del server" 
    }, { status: 500 });
  }
}

