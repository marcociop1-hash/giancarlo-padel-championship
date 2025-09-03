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
    
    // Verifica stato torneo
    const tournamentDoc = await db.collection("config").doc("tournament").get();
    const tournamentData = tournamentDoc.exists ? tournamentDoc.data() : {};
    
    // Conta partite per fase
    const campionatoMatches = await db.collection("matches").where("phase", "==", "campionato").get();
    const supercoppaMatches = await db.collection("matches").where("phase", "==", "supercoppa").get();
    const completedMatches = await db.collection("matches").where("status", "==", "completed").get();
    
    // Conta standings
    const standings = await db.collection("standings_campionato").get();
    
    // Conta giocatori
    const players = await db.collection("players").get();
    
    return NextResponse.json({
      ok: true,
      status: {
        tournament: {
          phase: (tournamentData as any)?.phase || "campionato",
          completedAt: (tournamentData as any)?.completedAt,
          supercoppaStartedAt: (tournamentData as any)?.supercoppaStartedAt,
        },
        matches: {
          campionato: campionatoMatches.size,
          supercoppa: supercoppaMatches.size,
          completed: completedMatches.size,
          total: campionatoMatches.size + supercoppaMatches.size,
        },
        standings: standings.size,
        players: players.size,
      }
    });
  } catch (error: any) {
    console.error("ERRORE /api/admin/check-status:", error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}

export async function POST() {
  try {
    const db = initAdmin();
    
    // Pulisci completamente lo stato
    const batch = db.batch();
    
    // 1. Cancella standings
    const standings = await db.collection("standings_campionato").get();
    standings.docs.forEach(doc => batch.delete(doc.ref));
    
    // 2. Cancella TUTTE le partite (sia campionato che supercoppa)
    const allMatches = await db.collection("matches").get();
    allMatches.docs.forEach(doc => batch.delete(doc.ref));
    
    // 3. Resetta stato torneo
    batch.set(db.collection("config").doc("tournament"), {
      phase: "campionato",
      completedAt: null,
      supercoppaStartedAt: null,
      totalMatches: null,
    }, { merge: true });
    
    await batch.commit();
    
    // 4. Invalida la cache della classifica
    try {
      const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/classifica?refresh=true`);
      if (!response.ok) {
        console.log('Errore invalidation cache classifica:', response.status);
      }
    } catch (e) {
      console.log('Errore invalidation cache classifica:', e);
    }
    
    return NextResponse.json({
      ok: true,
      message: "Stato pulito. Tutte le partite e standings eliminate, torneo resettato a 'campionato'.",
      deleted: {
        standings: standings.size,
        matches: allMatches.size,
      }
    });
  } catch (error: any) {
    console.error("ERRORE /api/admin/check-status POST:", error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}
