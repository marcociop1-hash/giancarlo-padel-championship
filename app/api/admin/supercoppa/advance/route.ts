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
      throw new Error(
        "Mancano FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL o FIREBASE_PRIVATE_KEY in .env.local"
      );
    }

    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });
  }
  return getFirestore();
}

type LightPlayer = { id: string | null; name: string; points?: number; wins?: number; rank?: number };

function toLight(p: any): LightPlayer {
  return {
    id: p?.id ?? null,
    name: p?.name ?? p?.Nome ?? p?.displayName ?? p?.username ?? p?.id ?? "??",
    points: typeof p?.points === "number" ? p.points : undefined,
    wins: typeof p?.wins === "number" ? p.wins : undefined,
    rank: typeof p?.rank === "number" ? p.rank : undefined,
  };
}

type MatchData = {
  id: string;
  round?: number;
  matchNumber?: number;
  status?: string;
  winnerTeam?: string;
  teamA?: any[];
  teamB?: any[];
  winnerAdvancesTo?: string;
  isPlaceholder?: boolean;
  [key: string]: any;
};

async function advanceWinners(db: FirebaseFirestore.Firestore) {
  // Carica tutte le partite della supercoppa
  const matchesSnap = await db
    .collection("matches")
    .where("phase", "==", "supercoppa")
    .orderBy("round", "asc")
    .orderBy("matchNumber", "asc")
    .get();

  const matches = matchesSnap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as MatchData[];

  // Raggruppa per round
  const rounds = new Map<number, MatchData[]>();
  matches.forEach(match => {
    if (!rounds.has(match.round || 0)) {
      rounds.set(match.round || 0, []);
    }
    rounds.get(match.round || 0)!.push(match);
  });

  const batch = db.batch();
  let updatedMatches = 0;

  // Per ogni round (eccetto l'ultimo), popola i placeholder del round successivo
  const maxRound = Math.max(...Array.from(rounds.keys()));
  
  for (let currentRound = 1; currentRound < maxRound; currentRound++) {
    const currentMatches = rounds.get(currentRound) || [];
    const completedMatches = currentMatches.filter(m => m.status === "completed" && m.scoreA !== undefined && m.scoreB !== undefined);
    
    if (completedMatches.length === 0) continue;

    console.log(`🔄 Processando round ${currentRound}: ${completedMatches.length} partite completate`);

    // Raggruppa i team vincitori
    const winningTeams = completedMatches.map(match => {
      const winnerTeam = match.scoreA > match.scoreB ? match.teamA : match.teamB;
      return {
        team: winnerTeam,
        matchNumber: match.matchNumber,
        winnerAdvancesTo: match.winnerAdvancesTo
      };
    });

    // Popola i placeholder del round successivo
    const nextRound = currentRound + 1;
    const nextRoundMatches = rounds.get(nextRound) || [];
    
    console.log(`📋 Round ${nextRound}: ${nextRoundMatches.length} partite (${nextRoundMatches.filter(m => m.isPlaceholder).length} placeholder)`);
    
    for (let i = 0; i < winningTeams.length; i += 2) {
      if (i + 1 >= winningTeams.length) break;
      
      const team1 = winningTeams[i];
      const team2 = winningTeams[i + 1];
      
      // Trova il placeholder corrispondente
      const placeholderMatch = nextRoundMatches.find(m => 
        m.isPlaceholder && m.matchNumber === Math.floor(i / 2) + 1
      );
      
      if (placeholderMatch && team1.team && team2.team) {
        console.log(`✅ Aggiornando placeholder ${placeholderMatch.id} con team ${team1.team.map(p => p.name).join('+')} vs ${team2.team.map(p => p.name).join('+')}`);
        
        // Aggiorna il placeholder con i team reali
        batch.update(db.collection("matches").doc(placeholderMatch.id), {
          teamA: team1.team.map(toLight),
          teamB: team2.team.map(toLight),
          status: "scheduled",
          isPlaceholder: false,
          updatedAt: Timestamp.now()
        });
        updatedMatches++;
      }
    }
  }

  if (updatedMatches > 0) {
    await batch.commit();
  }

  return { updated: updatedMatches };
}

export async function POST() {
  try {
    const db = initAdmin();
    const result = await advanceWinners(db);

    return NextResponse.json({
      ok: true,
      message: `Avanzamento completato. Aggiornati ${result.updated} placeholder.`,
      updated: result.updated
    });
  } catch (error: any) {
    console.error("ERRORE /api/admin/supercoppa/advance:", error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}
