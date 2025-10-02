// app/api/admin/link-player-email/route.ts
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

export async function POST(req: Request) {
  try {
    const db = initAdmin();
    
    const body = await req.json();
    const { playerId, email } = body;
    
    if (!playerId || !email) {
      return NextResponse.json({ 
        error: "ID giocatore e email sono obbligatori" 
      }, { status: 400 });
    }
    
    // Verifica che il giocatore esista
    const playerDoc = await db.collection("players").doc(playerId).get();
    if (!playerDoc.exists) {
      return NextResponse.json({ 
        error: "Giocatore non trovato" 
      }, { status: 404 });
    }
    
    // Verifica che l'email non sia già associata a un altro giocatore
    const existingPlayer = await db.collection("players")
      .where("email", "==", email)
      .limit(1)
      .get();
    
    if (!existingPlayer.empty) {
      const existingId = existingPlayer.docs[0].id;
      if (existingId !== playerId) {
        return NextResponse.json({ 
          error: `L'email ${email} è già associata al giocatore ${existingPlayer.docs[0].data().name}` 
        }, { status: 400 });
      }
    }
    
    // Aggiorna il giocatore con l'email
    await db.collection("players").doc(playerId).update({
      email: email.trim().toLowerCase(),
      updatedAt: new Date().toISOString()
    });
    
    return NextResponse.json({
      ok: true,
      message: `Email ${email} associata con successo al giocatore`,
      playerId
    });
    
  } catch (error: any) {
    console.error("ERRORE /api/admin/link-player-email:", error);
    return NextResponse.json({ 
      error: error.message || "Errore interno del server" 
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/admin/link-player-email",
    usage: "POST -> Associa un'email a un giocatore. Body: { playerId: string, email: string }",
  });
}



