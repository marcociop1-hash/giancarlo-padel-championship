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

export async function POST() {
  try {
    const db = initAdmin();
    
    console.log('🔄 Sincronizzazione name con username...');
    
    // Carica tutti i giocatori
    const playersSnap = await db.collection("players").get();
    const players = playersSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`📋 Trovati ${players.length} giocatori`);
    
    const batch = db.batch();
    const results: Array<{
      playerId: string;
      oldName: string;
      newName: string;
      success: boolean;
      error?: string;
    }> = [];
    
    for (const player of players) {
      const { id, username, name } = player as any;
      
      if (username && username !== name) {
        // Aggiorna il campo name con il valore di username
        const playerRef = db.collection("players").doc(id);
        batch.update(playerRef, {
          name: username,
          updatedAt: new Date().toISOString()
        });
        
        results.push({
          playerId: id,
          oldName: name,
          newName: username,
          success: true
        });
        
        console.log(`✅ ${id}: "${name}" → "${username}"`);
      } else if (username === name) {
        results.push({
          playerId: id,
          oldName: name,
          newName: username,
          success: true,
          note: "Già sincronizzato"
        });
        console.log(`ℹ️ ${id}: "${name}" (già sincronizzato)`);
      } else {
        results.push({
          playerId: id,
          oldName: name,
          newName: username || "N/A",
          success: false,
          error: "Username mancante"
        });
        console.log(`❌ ${id}: Username mancante`);
      }
    }
    
    // Esegui il batch update
    await batch.commit();
    
    const successCount = results.filter(r => r.success).length;
    const errorCount = results.filter(r => !r.success).length;
    
    console.log(`✅ Sincronizzazione completata: ${successCount} successi, ${errorCount} errori`);
    
    return NextResponse.json({
      success: true,
      message: `Sincronizzati ${successCount} campi name con username su ${players.length}`,
      results,
      summary: {
        total: players.length,
        success: successCount,
        errors: errorCount
      }
    });
    
  } catch (error: any) {
    console.error("ERRORE /api/admin/sync-name-with-username:", error);
    return NextResponse.json({ 
      error: error.message || "Errore interno del server durante la sincronizzazione" 
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/admin/sync-name-with-username",
    usage: "POST -> Sincronizza il campo 'name' con il valore di 'username' per tutti i giocatori",
    description: "Questo endpoint aggiorna il campo 'name' di ogni giocatore con il valore del suo 'username', mantenendo la compatibilità con l'app esistente."
  });
}
