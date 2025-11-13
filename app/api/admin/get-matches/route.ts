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
    
    console.log('[API] 📋 Caricamento lista partite...');
    
    // Carica tutte le partite, ordinate per createdAt desc
    const matchesSnap = await db.collection("matches")
      .orderBy("createdAt", "desc")
      .get();
    
    const matches = matchesSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`[API] ✅ Trovate ${matches.length} partite`);
    
    return NextResponse.json({
      success: true,
      matches,
      count: matches.length
    });
    
  } catch (error: any) {
    console.error("[API] ❌ ERRORE /api/admin/get-matches:", error);
    
    // Se fallisce con orderBy, prova senza
    if (error.code === 'failed-precondition' || error.message?.includes('index')) {
      console.log('[API] 🔄 Tentativo senza orderBy...');
      try {
        const db = adminDb();
        const matchesSnap = await db.collection("matches").get();
        const matches = matchesSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // Ordina manualmente
        matches.sort((a: any, b: any) => {
          const dateA = a.createdAt || '';
          const dateB = b.createdAt || '';
          return dateB.localeCompare(dateA);
        });
        
        console.log(`[API] ✅ Trovate ${matches.length} partite (senza orderBy)`);
        
        return NextResponse.json({
          success: true,
          matches,
          count: matches.length
        });
      } catch (e2) {
        console.error("[API] ❌ Errore anche senza orderBy:", e2);
      }
    }
    
    return NextResponse.json({ 
      error: error.message || "Errore interno del server durante il caricamento delle partite" 
    }, { status: 500 });
  }
}

