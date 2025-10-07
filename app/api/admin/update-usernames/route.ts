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
    const db = initAdmin();
    
    // Parsing del body
    const body = await req.json();
    const { usernameUpdates } = body;
    
    if (!usernameUpdates || !Array.isArray(usernameUpdates)) {
      return NextResponse.json({ 
        error: "usernameUpdates deve essere un array di oggetti { playerId: string, newUsername: string }" 
      }, { status: 400 });
    }
    
    console.log(`🔄 Aggiornamento ${usernameUpdates.length} username...`);
    
    const batch = db.batch();
    const results = [];
    
    for (const update of usernameUpdates) {
      const { playerId, newUsername } = update;
      
      if (!playerId || !newUsername) {
        results.push({
          playerId,
          success: false,
          error: "playerId e newUsername sono richiesti"
        });
        continue;
      }
      
      try {
        const playerRef = db.collection("players").doc(playerId);
        batch.update(playerRef, {
          username: newUsername,
          updatedAt: new Date().toISOString()
        });
        
        results.push({
          playerId,
          newUsername,
          success: true
        });
        
        console.log(`✅ ${playerId} → ${newUsername}`);
      } catch (error: any) {
        results.push({
          playerId,
          success: false,
          error: error.message
        });
        console.error(`❌ Errore aggiornamento ${playerId}:`, error);
      }
    }
    
    // Esegui il batch update
    await batch.commit();
    
    const successCount = results.filter(r => r.success).length;
    const errorCount = results.filter(r => !r.success).length;
    
    console.log(`✅ Aggiornamento completato: ${successCount} successi, ${errorCount} errori`);
    
    return NextResponse.json({
      success: true,
      message: `Aggiornati ${successCount} username su ${usernameUpdates.length}`,
      results,
      summary: {
        total: usernameUpdates.length,
        success: successCount,
        errors: errorCount
      }
    });
    
  } catch (error: any) {
    console.error("ERRORE /api/admin/update-usernames:", error);
    return NextResponse.json({ 
      error: error.message || "Errore interno del server durante l'aggiornamento degli username" 
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/admin/update-usernames",
    usage: "POST -> Aggiorna username di più giocatori in batch",
    example: {
      usernameUpdates: [
        { playerId: "player1_id", newUsername: "Nuovo Username 1" },
        { playerId: "player2_id", newUsername: "Nuovo Username 2" }
      ]
    }
  });
}
