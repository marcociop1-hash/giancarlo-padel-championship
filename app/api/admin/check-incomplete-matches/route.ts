// app/api/admin/check-incomplete-matches/route.ts
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
    
    // Trova tutte le partite del campionato
    const matchesSnap = await db.collection("matches").where("phase", "==", "campionato").get();
    const matches = matchesSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Filtra partite incomplete
    const incompleteMatches = matches.filter((m: any) => 
      m.status === "scheduled" || m.status === "confirmed" || 
      (m.status === "completed" && (m.scoreA === undefined || m.scoreB === undefined))
    );
    
    // Filtra partite completate
    const completedMatches = matches.filter((m: any) => 
      m.status === "completed" && m.scoreA !== undefined && m.scoreB !== undefined
    );
    
    // Trova giocatori
    const playersSnap = await db.collection("players").get();
    const players = playersSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    const maxTotalMatches = players.length - 1;
    const remainingMatches = maxTotalMatches - completedMatches.length;
    
    return NextResponse.json({
      ok: true,
      summary: {
        totalPlayers: players.length,
        maxTotalMatches,
        completedMatches: completedMatches.length,
        incompleteMatches: incompleteMatches.length,
        remainingMatches
      },
      incompleteMatches: incompleteMatches.map((m: any) => ({
        id: m.id,
        status: m.status,
        teamA: m.teamA?.map((p: any) => ({ id: p.id, name: p.name })),
        teamB: m.teamB?.map((p: any) => ({ id: p.id, name: p.name })),
        scoreA: m.scoreA,
        scoreB: m.scoreB,
        date: m.date,
        time: m.place,
        createdAt: m.createdAt
      })),
      canGenerateNewDay: incompleteMatches.length === 0 && remainingMatches > 0
    });
  } catch (error: any) {
    console.error("ERRORE /api/admin/check-incomplete-matches:", error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}



