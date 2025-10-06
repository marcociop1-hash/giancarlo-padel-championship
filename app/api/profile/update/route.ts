// app/api/profile/update/route.ts
import { NextResponse } from "next/server";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

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
  
  return { db: getFirestore(), auth: getAuth() };
}

export async function POST(req: Request) {
  try {
    const { db, auth } = initAdmin();
    
    // Verifica autenticazione
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Token di autenticazione mancante" }, { status: 401 });
    }
    
    const token = authHeader.substring(7);
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch (error) {
      return NextResponse.json({ error: "Token non valido" }, { status: 401 });
    }
    
    const userId = decodedToken.uid;
    const userEmail = decodedToken.email;
    
    if (!userEmail) {
      return NextResponse.json({ error: "Email utente non disponibile" }, { status: 400 });
    }
    
    // Parsing del body
    const body = await req.json();
    const { newUsername } = body;
    
    if (!newUsername) {
      return NextResponse.json({ error: "Nuovo username richiesto" }, { status: 400 });
    }
    
    // Aggiorna username nel profilo Firestore usando privilegi admin
    await db.collection('players').doc(userId).update({
      username: newUsername,
      updatedAt: new Date().toISOString()
    });
    
    return NextResponse.json({
      success: true,
      message: "Username aggiornato con successo",
      newUsername
    });
    
  } catch (error: any) {
    console.error("Errore aggiornamento profilo:", error);
    return NextResponse.json({ 
      error: error.message || "Errore interno del server" 
    }, { status: 500 });
  }
}
