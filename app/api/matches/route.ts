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

export async function GET() {
  try {
    const db = adminDb();
    
    console.log('[API] 📋 Caricamento lista partite (pubblico)...');
    
    // Carica tutte le partite
    let matchesSnap;
    try {
      matchesSnap = await db.collection("matches")
        .orderBy("createdAt", "desc")
        .get();
    } catch (e: any) {
      // Se fallisce con orderBy (indice mancante), prova senza
      if (e.code === 'failed-precondition' || e.message?.includes('index')) {
        console.log('[API] ⚠️ OrderBy fallito, carico senza ordinamento...');
        matchesSnap = await db.collection("matches").get();
      } else {
        throw e;
      }
    }
    
    const matches = matchesSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Se non ordinato, ordina manualmente
    if (!matchesSnap.query) {
      matches.sort((a: any, b: any) => {
        const dateA = a.createdAt || '';
        const dateB = b.createdAt || '';
        return dateB.localeCompare(dateA);
      });
    }
    
    console.log(`[API] ✅ Trovate ${matches.length} partite`);
    
    return NextResponse.json({
      success: true,
      matches,
      count: matches.length
    });
    
  } catch (error: any) {
    console.error("[API] ❌ ERRORE /api/matches:", error);
    return NextResponse.json({ 
      error: error.message || "Errore interno del server durante il caricamento delle partite" 
    }, { status: 500 });
  }
}

