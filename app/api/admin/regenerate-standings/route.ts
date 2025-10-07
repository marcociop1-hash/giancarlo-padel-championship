// app/api/admin/regenerate-standings/route.ts
import { NextResponse } from "next/server";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

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
    
    console.log('🔄 === RIGENERAZIONE CLASSIFICA CONGELATA ===');
    
    // Carica tutte le partite di campionato completate
    const snap = await db
      .collection("matches")
      .where("phase", "==", "campionato")
      .where("status", "==", "completed")
      .get();
      
    console.log(`📊 Trovate ${snap.size} partite di campionato completate`);

    // Calcola la classifica completa
    const stats = new Map<string, {
      name: string; 
      points: number; 
      setsWon: number; 
      setsLost: number; 
      played: number;
      gamesWon: number;
      gamesLost: number;
    }>();

    const ensure = (id: string, name: string) => {
      if (!stats.has(id)) {
        stats.set(id, { name, points: 0, setsWon: 0, setsLost: 0, played: 0, gamesWon: 0, gamesLost: 0 });
      }
      return stats.get(id)!;
    };

    snap.forEach((d) => {
      const m = d.data() as any;
      const a = Number(m.scoreA || 0);
      const b = Number(m.scoreB || 0);
      
      // Calcola game totali se disponibili
      const gamesA = Number(m.totalGamesA || 0);
      const gamesB = Number(m.totalGamesB || 0);
      
      // Team A
      if (m.teamA && Array.isArray(m.teamA)) {
        m.teamA.forEach((player: any) => {
          if (player && player.id) {
            const s = ensure(player.id, player.name);
            s.played += 1;
            s.points += a; // Punti = set vinti
            s.setsWon += a;
            s.setsLost += b;
            s.gamesWon += gamesA;
            s.gamesLost += gamesB;
          }
        });
      }
      
      // Team B
      if (m.teamB && Array.isArray(m.teamB)) {
        m.teamB.forEach((player: any) => {
          if (player && player.id) {
            const s = ensure(player.id, player.name);
            s.played += 1;
            s.points += b; // Punti = set vinti
            s.setsWon += b;
            s.setsLost += a;
            s.gamesWon += gamesB;
            s.gamesLost += gamesA;
          }
        });
      }
    });

    const items = Array.from(stats.entries()).map(([playerId, s]) => ({
      playerId,
      name: s.name,
      points: s.points,
      setsWon: s.setsWon,
      setsLost: s.setsLost,
      setDiff: s.setsWon - s.setsLost,
      gamesWon: s.gamesWon,
      gamesLost: s.gamesLost,
      gameDiff: s.gamesWon - s.gamesLost,
      played: s.played,
      wins: 0
    }));

    items.sort((x, y) => {
      if (y.points !== x.points) return y.points - x.points;
      if (y.setDiff !== x.setDiff) return y.setDiff - x.setDiff;
      if (y.gameDiff !== x.gameDiff) return y.gameDiff - x.gameDiff;
      if (x.played !== y.played) return x.played - y.played;
      return x.name.localeCompare(y.name);
    });

    // Salva la nuova classifica congelata
    const batch = db.batch();
    const col = db.collection("standings_campionato");
    
    // Svuota standings esistenti
    const old = await col.get();
    old.forEach((d) => batch.delete(d.ref));

    items.forEach((it, idx) => {
      if (!it.playerId) return;
      const ref = col.doc(it.playerId);
      batch.set(ref, { ...it, rank: idx + 1, frozenAt: Timestamp.now() });
    });

    await batch.commit();
    
    console.log(`✅ Classifica congelata rigenerata con ${items.length} giocatori`);
    
    return NextResponse.json({
      ok: true,
      message: `Classifica congelata rigenerata con ${items.length} giocatori`,
      players: items.length,
      sample: items.slice(0, 3)
    });
    
  } catch (error: any) {
    console.error("ERRORE /api/admin/regenerate-standings:", error);
    return NextResponse.json({ 
      error: error.message || "Errore interno del server" 
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/admin/regenerate-standings",
    usage: {
      POST: "Rigenera la classifica congelata con tutti i dettagli (sets, games, played).",
    },
  });
}
