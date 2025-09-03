import { NextResponse } from "next/server";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function initAdmin() {
  if (!getApps().length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error(
        "Mancano FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL o FIREBASE_PRIVATE_KEY in .env.local"
      );
    }

    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });
  }
  return getFirestore();
}

export async function POST() {
  try {
    const db = initAdmin();
    
    // 1. Elimina tutte le partite della supercoppa
    const matchesSnap = await db
      .collection("matches")
      .where("phase", "==", "supercoppa")
      .get();

    const batch = db.batch();
    matchesSnap.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    // 2. Riporta il torneo alla fase campionato-completato
    batch.set(
      db.collection("config").doc("tournament"),
      { 
        phase: "campionato-completato",
        supercoppaStartedAt: null,
        totalMatches: null
      },
      { merge: true }
    );

    await batch.commit();

    return NextResponse.json({
      ok: true,
      message: `Supercoppa azzerata. Eliminate ${matchesSnap.docs.length} partite.`,
      deletedMatches: matchesSnap.docs.length,
      phase: "campionato-completato"
    });
  } catch (error: any) {
    console.error("ERRORE /api/admin/supercoppa/reset:", error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}



