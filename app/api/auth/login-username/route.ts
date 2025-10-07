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

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json();
    
    if (!username || !password) {
      return NextResponse.json({ 
        error: "Username e password sono richiesti" 
      }, { status: 400 });
    }
    
    console.log('🔐 Tentativo login con username:', username);
    
    const db = initAdmin();
    
    // 1. Cerca il giocatore per username nel database
    const playersQuery = await db.collection("players")
      .where("username", "==", username)
      .limit(1)
      .get();
    
    if (playersQuery.empty) {
      console.log('❌ Username non trovato:', username);
      return NextResponse.json({ 
        error: "Username non trovato" 
      }, { status: 404 });
    }
    
    const playerDoc = playersQuery.docs[0];
    const playerData = playerDoc.data() as any;
    const email = playerData.email;
    
    if (!email) {
      console.log('❌ Email non trovata per username:', username);
      return NextResponse.json({ 
        error: "Email non associata a questo username" 
      }, { status: 400 });
    }
    
    console.log('✅ Username trovato, email associata:', email);
    
    // 2. Restituisci l'email associata all'username
    // L'autenticazione vera e propria verrà gestita dal client con Firebase Auth
    return NextResponse.json({
      success: true,
      user: {
        email: email,
        username: username
      },
      message: "Username trovato"
    });
    
  } catch (error: any) {
    console.error("ERRORE /api/auth/login-username:", error);
    return NextResponse.json({ 
      error: error.message || "Errore interno del server durante il login" 
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/auth/login-username",
    usage: "POST -> Login con username e password. Body: { username: string, password: string }",
    description: "Permette l'accesso usando username invece di email, mantenendo la sicurezza di Firebase Auth"
  });
}
