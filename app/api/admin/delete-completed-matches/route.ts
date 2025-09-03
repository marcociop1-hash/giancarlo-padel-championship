// app/api/admin/delete-completed-matches/route.ts
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
  return NextResponse.json({
    ok: true,
    route: "/api/admin/delete-completed-matches",
    usage: "POST -> Cancella solo le partite con status 'completed', mantenendo quelle in programma.",
  });
}

export async function POST() {
  try {
    const db = initAdmin();
    
    // Trova tutte le partite completate
    const completedMatches = await db.collection("matches").where("status", "==", "completed").get();
    
    if (completedMatches.empty) {
      return NextResponse.json({
        ok: true,
        message: "Nessuna partita completata da cancellare.",
        deleted: 0
      });
    }
    
    // Cancella le partite completate
    const batch = db.batch();
    completedMatches.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    
    // Invalida la cache della classifica
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
      message: `${completedMatches.size} partite completate eliminate. Classifica resettata.`,
      deleted: completedMatches.size
    });
  } catch (error: any) {
    console.error("ERRORE /api/admin/delete-completed-matches:", error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}



