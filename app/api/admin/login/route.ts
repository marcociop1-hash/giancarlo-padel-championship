// app/api/admin/login/route.ts
import { NextResponse } from "next/server";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { isUsernameAdmin, isAdminPasspartout } from "../../../../lib/admin";

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
  
  return { auth: getAuth() };
}

export async function POST(req: Request) {
  try {
    const { auth } = initAdmin();
    
    const body = await req.json();
    const { username, password, targetUserId } = body;
    
    if (!username || !password) {
      return NextResponse.json({ error: "Username e password richiesti" }, { status: 400 });
    }
    
    // Verifica se l'utente è admin
    if (!isUsernameAdmin(username)) {
      return NextResponse.json({ error: "Accesso non autorizzato" }, { status: 403 });
    }
    
    // Verifica password passpartout
    if (!isAdminPasspartout(password)) {
      return NextResponse.json({ error: "Password non valida" }, { status: 403 });
    }
    
    // Se è richiesto l'accesso a un profilo specifico
    if (targetUserId) {
      try {
        // Genera un token personalizzato per l'utente target
        const customToken = await auth.createCustomToken(targetUserId);
        return NextResponse.json({ 
          success: true, 
          customToken,
          message: "Accesso admin autorizzato"
        });
      } catch (error) {
        return NextResponse.json({ error: "Errore nella generazione del token" }, { status: 500 });
      }
    }
    
    return NextResponse.json({ 
      success: true, 
      message: "Accesso admin autorizzato"
    });
    
  } catch (error: any) {
    console.error("Errore login admin:", error);
    return NextResponse.json({ 
      error: error.message || "Errore interno del server" 
    }, { status: 500 });
  }
}
