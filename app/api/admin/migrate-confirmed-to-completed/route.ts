// app/api/admin/migrate-confirmed-to-completed/route.ts
import { NextResponse } from "next/server";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { isEmailAdmin } from "../../../../lib/admin";

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

export async function POST(req: Request) {
  try {
    const db = initAdmin();
    
    // Verifica autenticazione
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Token di autenticazione mancante" }, { status: 401 });
    }

    const token = authHeader.substring(7);
    let decodedToken;
    try {
      const { getAuth } = await import("firebase-admin/auth");
      const auth = getAuth();
      decodedToken = await auth.verifyIdToken(token);
    } catch (error) {
      return NextResponse.json({ error: "Token non valido" }, { status: 401 });
    }

    const userEmail = decodedToken.email;
    if (!userEmail || !isEmailAdmin(userEmail)) {
      return NextResponse.json({ error: "Accesso negato. Solo gli admin possono eseguire questa operazione." }, { status: 403 });
    }

    // Trova tutte le partite con status "confirmed"
    const matchesSnapshot = await db.collection("matches")
      .where("status", "==", "confirmed")
      .get();

    if (matchesSnapshot.empty) {
      return NextResponse.json({ 
        success: true, 
        message: "Nessuna partita con status 'confirmed' trovata",
        migratedCount: 0 
      });
    }

    // Aggiorna tutte le partite da "confirmed" a "completed"
    const batch = db.batch();
    let migratedCount = 0;

    matchesSnapshot.docs.forEach((doc) => {
      batch.update(doc.ref, { 
        status: "completed",
        migratedAt: new Date().toISOString()
      });
      migratedCount++;
    });

    await batch.commit();

    return NextResponse.json({ 
      success: true, 
      message: `Migrazione completata con successo`,
      migratedCount 
    });

  } catch (error: any) {
    console.error("Errore nella migrazione:", error);
    return NextResponse.json({ 
      error: error.message || "Errore interno del server" 
    }, { status: 500 });
  }
}
