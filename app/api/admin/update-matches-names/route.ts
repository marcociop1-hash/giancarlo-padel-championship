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
    console.log('🔄 Aggiornamento nomi nelle partite...');

    // 1. Carica tutti i giocatori per creare la mappa ID -> nuovo nome
    const playersSnap = await db.collection("players").get();
    const playersMap = new Map();
    playersSnap.docs.forEach(doc => {
      const player = doc.data() as any;
      playersMap.set(doc.id, {
        name: player.name,
        username: player.username
      });
    });
    console.log(`📋 Caricati ${playersMap.size} giocatori`);

    // 2. Carica tutte le partite
    const matchesSnap = await db.collection("matches").get();
    const matches = matchesSnap.docs.map(doc => ({
      id: doc.id,
      ...(doc.data() as any)
    }));
    console.log(`⚽ Trovate ${matches.length} partite`);

    const batch = db.batch();
    let updatedMatches = 0;

    for (const match of matches) {
      let needsUpdate = false;
      const updateData: any = {};

      // Aggiorna teamA
      if (match.teamA && Array.isArray(match.teamA)) {
        const updatedTeamA = match.teamA.map((player: any) => {
          if (player && player.id && playersMap.has(player.id)) {
            const playerData = playersMap.get(player.id);
            const newName = playerData.name || playerData.username;
            if (player.name !== newName) {
              needsUpdate = true;
              return { ...player, name: newName };
            }
          }
          return player;
        });
        if (needsUpdate) {
          updateData.teamA = updatedTeamA;
        }
      }

      // Aggiorna teamB
      if (match.teamB && Array.isArray(match.teamB)) {
        const updatedTeamB = match.teamB.map((player: any) => {
          if (player && player.id && playersMap.has(player.id)) {
            const playerData = playersMap.get(player.id);
            const newName = playerData.name || playerData.username;
            if (player.name !== newName) {
              needsUpdate = true;
              return { ...player, name: newName };
            }
          }
          return player;
        });
        if (needsUpdate) {
          updateData.teamB = updatedTeamB;
        }
      }

      if (needsUpdate) {
        const matchRef = db.collection("matches").doc(match.id);
        batch.update(matchRef, updateData);
        updatedMatches++;
        console.log(`✅ Aggiornata partita ${match.id}`);
      }
    }

    await batch.commit();
    
    console.log(`✅ Aggiornamento completato: ${updatedMatches} partite aggiornate su ${matches.length}`);

    return NextResponse.json({
      success: true,
      message: `Aggiornate ${updatedMatches} partite con i nuovi nomi`,
      summary: {
        totalMatches: matches.length,
        updatedMatches: updatedMatches,
        totalPlayers: playersMap.size
      }
    });

  } catch (error: any) {
    console.error("ERRORE /api/admin/update-matches-names:", error);
    return NextResponse.json({ 
      error: error.message || "Errore interno del server durante l'aggiornamento delle partite" 
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/admin/update-matches-names",
    usage: "POST -> Aggiorna tutti i nomi dei giocatori nelle partite esistenti con i nuovi nomi sincronizzati.",
  });
}
