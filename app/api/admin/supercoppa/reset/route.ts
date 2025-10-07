// app/api/admin/supercoppa/reset/route.ts
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
      throw new Error("Mancano FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL o FIREBASE_PRIVATE_KEY in .env.local");
    }
    
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  
  return getFirestore();
}

export async function POST() {
  try {
    const db = initAdmin();
    
    console.log('🔄 === RESET SUPERCOPPA INIZIATO ===');
    
    // 1. Elimina tutte le partite della supercoppa
    const supercoppaMatches = await db.collection("matches")
      .where("phase", "==", "supercoppa")
      .get();
    
    console.log(`📊 Trovate ${supercoppaMatches.size} partite supercoppa da eliminare`);
    
    const batch = db.batch();
    supercoppaMatches.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    // 2. Ripristina lo stato del torneo a "campionato-completato"
    const configRef = db.collection("config").doc("tournament");
    batch.set(configRef, { 
      phase: "campionato-completato",
      supercoppaResetAt: Timestamp.now()
    }, { merge: true });
    
    await batch.commit();
    
    console.log('✅ Reset supercoppa completato');
    
    return NextResponse.json({
      ok: true,
      message: `Supercoppa resettata con successo. Eliminate ${supercoppaMatches.size} partite.`,
      deletedMatches: supercoppaMatches.size,
      phase: "campionato-completato"
    });
    
  } catch (error: any) {
    console.error("ERRORE /api/admin/supercoppa/reset:", error);
    return NextResponse.json({ 
      error: error.message || "Errore interno del server" 
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/admin/supercoppa/reset",
    usage: {
      POST: "Resetta completamente la supercoppa, elimina tutte le partite e ripristina lo stato a 'campionato-completato'.",
    },
  });
}