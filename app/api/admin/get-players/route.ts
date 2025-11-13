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
      throw new Error("Mancano FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL o FIREBASE_PRIVATE_KEY in .env.local");
    }
    
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  
  return getFirestore();
}

export async function GET() {
  try {
    const db = initAdmin();
    
    console.log('📋 Caricamento lista giocatori...');
    
    const playersSnap = await db.collection("players").get();
    const players = playersSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data() // Restituisce tutti i campi del documento
    }));
    
    console.log(`✅ Trovati ${players.length} giocatori`);
    
    return NextResponse.json({
      success: true,
      players,
      count: players.length
    });
    
  } catch (error: any) {
    console.error("ERRORE /api/admin/get-players:", error);
    return NextResponse.json({ 
      error: error.message || "Errore interno del server durante il caricamento dei giocatori" 
    }, { status: 500 });
  }
}
