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
    const { username } = await req.json();
    
    if (!username) {
      return NextResponse.json({ 
        error: "Username è richiesto" 
      }, { status: 400 });
    }
    
    console.log('🔐 Promozione utente ad admin:', username);
    
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
    const playerId = playerDoc.id;
    
    console.log('✅ Username trovato:', username, 'ID:', playerId);
    
    // 2. Aggiorna il ruolo ad admin
    await db.collection("players").doc(playerId).update({
      role: "admin",
      updatedAt: new Date().toISOString()
    });
    
    console.log('✅ Utente promosso ad admin:', username);
    
    return NextResponse.json({
      success: true,
      message: `Utente ${username} promosso ad admin con successo`,
      user: {
        id: playerId,
        username: username,
        email: playerData.email,
        role: "admin"
      }
    });
    
  } catch (error: any) {
    console.error("ERRORE /api/admin/promote-user:", error);
    return NextResponse.json({ 
      error: error.message || "Errore interno del server durante la promozione" 
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/admin/promote-user",
    usage: "POST -> Promuove un utente ad admin. Body: { username: string }",
    description: "Cerca l'utente per username e imposta il ruolo su 'admin'"
  });
}
