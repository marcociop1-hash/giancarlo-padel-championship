// app/api/admin/genera-giornata/route.ts
import { NextResponse } from "next/server";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** =========================
 *  INIT FIREBASE ADMIN
 *  ========================= */
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

/** =========================
 *  HELPERS
 *  ========================= */
type LightPlayer = { id: string | null; name: string; points?: number; wins?: number };
function toLight(p: any): LightPlayer {
  return {
    id: p?.id ?? null,
    name: p?.name ?? p?.Nome ?? p?.displayName ?? p?.username ?? p?.id ?? "??",
    points: typeof p?.points === "number" ? p.points : undefined,
    wins: typeof p?.wins === "number" ? p.wins : undefined,
  };
}
function getScoreForRanking(p: LightPlayer): number {
  return (p.points ?? p.wins ?? 0) as number;
}
function pairKey(a: string, b: string) {
  return [a, b].sort().join("__");
}
function sameQuartetKey(ids: string[]) {
  return ids.slice().sort().join("____");
}

/** =========================
 *  DETECT PHASE (per messaggistica)
 *  ========================= */
async function detectPhase(db: FirebaseFirestore.Firestore) {
  const cfgSnap = await db.collection("config").doc("tournament").get();
  const cfg = cfgSnap.exists ? (cfgSnap.data() as any) : {};
  if (cfg?.phase === "campionato-completato") return "campionato-completato";
  if (cfg?.phase === "campionato" || !cfg?.phase) return "campionato";
  return String(cfg?.phase);
}

/** =========================
<<<<<<< HEAD
 *  NUOVO ALGORITMO MIGLIORATO - Generazione accoppiamenti intelligente
 *  Priorità: 1) Compagni diversi, 2) Punteggi simili, 3) Avversari diversi
 *  ========================= */

interface MatchCandidate {
  teamA: LightPlayer[];
  teamB: LightPlayer[];
  weight: number;
  scoreA: number;
  scoreB: number;
}

interface PairingCandidate {
  player1: LightPlayer;
  player2: LightPlayer;
  combinedScore: number;
  pairKey: string;
}

/**
 * Genera tutte le possibili coppie valide (senza ripetizioni di compagni)
 */
function generateValidPairs(
  players: LightPlayer[],
  teammatePairs: Set<string>,
  playerScores: Map<string, number>
): PairingCandidate[] {
  const pairs: PairingCandidate[] = [];
  
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const player1 = players[i];
      const player2 = players[j];
      const pairKeyStr = pairKey(player1.id || "", player2.id || "");
      
      // PRIORITÀ 1: Evita compagni ripetuti
      if (teammatePairs.has(pairKeyStr)) {
        continue; // Salta questa coppia
      }
      
      const score1 = playerScores.get(player1.id || "") || 0;
      const score2 = playerScores.get(player2.id || "") || 0;
      
      pairs.push({
        player1,
        player2,
        combinedScore: score1 + score2,
        pairKey: pairKeyStr
      });
    }
  }
  
  // Ordina per punteggio combinato (per bilanciamento)
  pairs.sort((a, b) => a.combinedScore - b.combinedScore);
  
  return pairs;
}

/**
 * Calcola il peso di una partita basato sulle priorità
 */
function calculateMatchWeight(
  teamA: LightPlayer[],
  teamB: LightPlayer[],
  teammatePairs: Set<string>,
  opponentPairs: Set<string>,
  playerScores: Map<string, number>
): number {
  let weight = 0;
  
  // PRIORITÀ 1: Compagni ripetuti (PENALITÀ MASSIMA)
  const pairKeyA = pairKey(teamA[0].id || "", teamA[1].id || "");
  const pairKeyB = pairKey(teamB[0].id || "", teamB[1].id || "");
  
  if (teammatePairs.has(pairKeyA) || teammatePairs.has(pairKeyB)) {
    weight += 1000; // PENALITÀ MASSIMA
  }
  
  // PRIORITÀ 2: Differenza punteggi tra squadre (moltiplicata per 100)
  const scoreA = (playerScores.get(teamA[0].id || "") || 0) + (playerScores.get(teamA[1].id || "") || 0);
  const scoreB = (playerScores.get(teamB[0].id || "") || 0) + (playerScores.get(teamB[1].id || "") || 0);
  const scoreDifference = Math.abs(scoreA - scoreB);
  weight += scoreDifference * 100;
  
  // PRIORITÀ 3: Avversari ripetuti (penalità bassa)
  for (const playerA of teamA) {
    for (const playerB of teamB) {
      const opponentKey = pairKey(playerA.id || "", playerB.id || "");
      if (opponentPairs.has(opponentKey)) {
        weight += 10; // PENALITÀ BASSA
      }
    }
  }
  
  return weight;
}

/**
 * Genera la migliore combinazione di partite per 4 giocatori
 */
function generateBestMatch(
  players: LightPlayer[],
  teammatePairs: Set<string>,
  opponentPairs: Set<string>,
  playerScores: Map<string, number>
): MatchCandidate | null {
  if (players.length !== 4) return null;
  
  const candidates: MatchCandidate[] = [];

  // Genera tutte le possibili combinazioni di squadre
  const teamCombinations = [
    // Squadra A: [0,1], Squadra B: [2,3]
    { teamA: [players[0], players[1]], teamB: [players[2], players[3]] },
    // Squadra A: [0,2], Squadra B: [1,3]
    { teamA: [players[0], players[2]], teamB: [players[1], players[3]] },
    // Squadra A: [0,3], Squadra B: [1,2]
    { teamA: [players[0], players[3]], teamB: [players[1], players[2]] },
  ];
  
  for (const combo of teamCombinations) {
    const weight = calculateMatchWeight(
      combo.teamA,
      combo.teamB,
      teammatePairs,
      opponentPairs,
      playerScores
    );
    
    const scoreA = (playerScores.get(combo.teamA[0].id || "") || 0) + 
                   (playerScores.get(combo.teamA[1].id || "") || 0);
    const scoreB = (playerScores.get(combo.teamB[0].id || "") || 0) + 
                   (playerScores.get(combo.teamB[1].id || "") || 0);
    
    candidates.push({
      teamA: combo.teamA,
      teamB: combo.teamB,
      weight,
      scoreA,
      scoreB
    });
  }
  
  // Ordina per peso (più basso = migliore)
  candidates.sort((a, b) => a.weight - b.weight);
  
  return candidates[0] || null;
}

/**
 * Algoritmo principale per generare accoppiamenti intelligenti
 */
function generateIntelligentPairings(
  players: LightPlayer[],
  teammatePairs: Set<string>,
  opponentPairs: Set<string>,
  playerScores: Map<string, number>,
  playedCount: Map<string, number>
): MatchCandidate[] {
  const matches: MatchCandidate[] = [];
  const usedPlayers = new Set<string>();
  
  // Ordina i giocatori per numero di partite giocate (meno partite = priorità)
  const sortedPlayers = players
    .map(p => ({ ...p, matchesPlayed: playedCount.get(p.id || "") || 0 }))
    .sort((a, b) => a.matchesPlayed - b.matchesPlayed);
  
  // Genera partite finché abbiamo abbastanza giocatori
  while (usedPlayers.size < players.length - 3) {
    // Trova 4 giocatori non ancora usati
    const availablePlayers = sortedPlayers.filter(p => !usedPlayers.has(p.id || ""));
    
    if (availablePlayers.length < 4) break;
    
    // Prova diverse combinazioni di 4 giocatori per trovare la migliore
    let bestMatch: MatchCandidate | null = null;
    let bestPlayers: LightPlayer[] = [];
    
    // Prova con i primi 4 giocatori disponibili
    const firstFour = availablePlayers.slice(0, 4);
    const match1 = generateBestMatch(firstFour, teammatePairs, opponentPairs, playerScores);
    
    if (match1 && match1.weight < 1000) { // Solo se non ci sono compagni ripetuti
      bestMatch = match1;
      bestPlayers = firstFour;
    }
    
    // Se abbiamo più di 4 giocatori, prova anche con i prossimi 4
    if (availablePlayers.length >= 8) {
      const nextFour = availablePlayers.slice(4, 8);
      const match2 = generateBestMatch(nextFour, teammatePairs, opponentPairs, playerScores);
      
      if (match2 && match2.weight < 1000 && (!bestMatch || match2.weight < bestMatch.weight)) {
        bestMatch = match2;
        bestPlayers = nextFour;
      }
    }
    
    // Se non troviamo una combinazione senza compagni ripetuti, usa la migliore disponibile
    if (!bestMatch) {
      const fallbackMatch = generateBestMatch(firstFour, teammatePairs, opponentPairs, playerScores);
      if (fallbackMatch) {
        bestMatch = fallbackMatch;
        bestPlayers = firstFour;
      }
    }
    
    if (!bestMatch) break;
    
    // Aggiungi la partita e marca i giocatori come usati
    matches.push(bestMatch);
    bestPlayers.forEach(p => usedPlayers.add(p.id || ""));
  }
  
  return matches;
=======
 *  Scelta squadre senza ripetere compagni
 *  ========================= */
function chooseTeamsAvoidingRepeats(
  players: LightPlayer[],
  teammatePairs: Set<string>,
  playerScores: Map<string, number>
): { teamA: LightPlayer[]; teamB: LightPlayer[]; repeats: number; balance: number } | null {
  // Ordina per punteggio attuale (più basso prima per bilanciamento)
  const sortedByScore = players
    .map((p) => ({ ...p, currentScore: playerScores.get(p.id || "") || 0 }))
    .sort((a, b) => a.currentScore - b.currentScore);

  const P = sortedByScore;

  // Genera tutte le possibili combinazioni di squadre
  const candidates = [
    { A: [P[0], P[3]], B: [P[1], P[2]] }, // 1° + 4° vs 2° + 3°
    { A: [P[0], P[2]], B: [P[1], P[3]] }, // 1° + 3° vs 2° + 4°
    { A: [P[0], P[1]], B: [P[2], P[3]] }, // 1° + 2° vs 3° + 4°
  ].map((c) => {
    const k1 = pairKey(c.A[0].id || "", c.A[1].id || "");
    const k2 = pairKey(c.B[0].id || "", c.B[1].id || "");
    const repeats =
      (teammatePairs.has(k1) ? 1 : 0) + (teammatePairs.has(k2) ? 1 : 0);
    
    // Calcola bilanciamento basato sui punteggi attuali
    const sumA = (c.A[0].currentScore || 0) + (c.A[1].currentScore || 0);
    const sumB = (c.B[0].currentScore || 0) + (c.B[1].currentScore || 0);
    const balance = Math.abs(sumA - sumB);
    
    return { 
      teamA: c.A.map(toLight), 
      teamB: c.B.map(toLight), 
      repeats, 
      balance,
      sumA,
      sumB
    };
  });

  // Ordina per priorità: 1) meno ripetizioni, 2) migliore bilanciamento
  candidates.sort((x, y) => {
    if (x.repeats !== y.repeats) return x.repeats - y.repeats;
    return x.balance - y.balance;
  });

  return candidates[0] ?? null;
>>>>>>> 306201e0856fab274e289508f745d6efcb6e0aab
}

/** =========================
 *  GENERAZIONE GIORNATA COMPLETA
 *  ========================= */
async function generateCampionatoGiornata(db: FirebaseFirestore.Firestore) {
  const playersSnap = await db.collection("players").get();
  const players = playersSnap.docs.map((d) => toLight({ id: d.id, ...(d.data() as any) }));
  
  if (players.length < 4) {
    return { created: 0, reason: "not-enough-players" as const };
  }

  // storico campionato
  const matchesSnap = await db.collection("matches").where("phase", "==", "campionato").get();
  const matches = matchesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

  // Calcola il prossimo matchday: ogni 2 partite = 1 giornata
  const totalMatches = matches.length;
  const nextMatchday = Math.floor(totalMatches / 2) + 1;

  // CONTROLLO 1: Verifica che tutte le partite precedenti abbiano punteggi
  const incompleteMatches = matches.filter(m => 
    m.status === "scheduled" || m.status === "confirmed" || 
    (m.status === "completed" && (m.scoreA === undefined || m.scoreB === undefined))
  );
  
  if (incompleteMatches.length > 0) {
    return { 
      created: 0, 
      reason: "incomplete-matches" as const,
      incompleteCount: incompleteMatches.length,
      message: `Ci sono ${incompleteMatches.length} partite senza punteggi. Inserisci tutti i risultati prima di generare una nuova giornata.`
    };
  }

  // CONTROLLO 2: Verifica numero massimo partite per giocatore
  const completedMatches = matches.filter(m => m.status === "completed");
  
  // Calcola quante partite ha fatto ogni giocatore
  const playerMatchCount = new Map<string, number>();
  for (const p of players) {
    playerMatchCount.set(p.id || "", 0);
  }
  
  for (const m of completedMatches) {
    const a: LightPlayer[] = (m.teamA || []).map(toLight);
    const b: LightPlayer[] = (m.teamB || []).map(toLight);
    const ids = [...a, ...b].map((x) => x.id || "").filter(Boolean);
    for (const pid of ids) {
      playerMatchCount.set(pid, (playerMatchCount.get(pid) || 0) + 1);
    }
  }
  
  // Ogni giocatore dovrebbe giocare con tutti gli altri (numero giocatori - 1)
  const maxMatchesPerPlayer = players.length - 1;
  const allPlayersCompleted = Array.from(playerMatchCount.values()).every(count => count >= maxMatchesPerPlayer);
  
  if (allPlayersCompleted) {
    return { 
      created: 0, 
      reason: "campionato-completato" as const,
      message: `Campionato completato. Tutti i giocatori hanno giocato ${maxMatchesPerPlayer} partite.`
    };
  }

  const playedCount = new Map<string, number>();
  const teammatePairs = new Set<string>();
<<<<<<< HEAD
  const opponentPairs = new Set<string>();
=======
>>>>>>> 306201e0856fab274e289508f745d6efcb6e0aab
  const existingQuartets = new Set<string>();
  for (const p of players) playedCount.set(p.id || "", 0);

  for (const m of matches) {
    const a: LightPlayer[] = (m.teamA || []).map(toLight);
    const b: LightPlayer[] = (m.teamB || []).map(toLight);
    const ids = [...a, ...b].map((x) => x.id || "").filter(Boolean);
    if (ids.length === 4) existingQuartets.add(sameQuartetKey(ids));
    for (const pid of ids) playedCount.set(pid, (playedCount.get(pid) || 0) + 1);
<<<<<<< HEAD
    
    // Raccoglie coppie di compagni (stessa squadra)
    if (a.length === 2) teammatePairs.add(pairKey(a[0]?.id || "", a[1]?.id || ""));
    if (b.length === 2) teammatePairs.add(pairKey(b[0]?.id || "", b[1]?.id || ""));
    
    // Raccoglie coppie di avversari (squadre diverse)
    if (a.length === 2 && b.length === 2) {
      for (const playerA of a) {
        for (const playerB of b) {
          opponentPairs.add(pairKey(playerA.id || "", playerB.id || ""));
        }
      }
    }
=======
    if (a.length === 2) teammatePairs.add(pairKey(a[0]?.id || "", a[1]?.id || ""));
    if (b.length === 2) teammatePairs.add(pairKey(b[0]?.id || "", b[1]?.id || ""));
>>>>>>> 306201e0856fab274e289508f745d6efcb6e0aab
  }

  // Calcola quante partite possiamo creare
  const numPlayers = players.length;
  const maxMatchesPerDay = Math.floor(numPlayers / 4);
  
  if (maxMatchesPerDay === 0) {
    return { created: 0, reason: "not-enough-players" as const };
  }

  // Calcola punteggi attuali per bilanciamento
  const playerScores = new Map<string, number>();
  for (const p of players) {
    playerScores.set(p.id || "", 0);
  }
  
  // Somma i punteggi dalle partite completate
  for (const m of completedMatches) {
    const a: LightPlayer[] = (m.teamA || []).map(toLight);
    const b: LightPlayer[] = (m.teamB || []).map(toLight);
    const scoreA = Number(m.scoreA || 0);
    const scoreB = Number(m.scoreB || 0);
    
    a.forEach(p => {
      if (p.id) {
        const current = playerScores.get(p.id) || 0;
        playerScores.set(p.id, current + scoreA);
      }
    });
    
    b.forEach(p => {
      if (p.id) {
        const current = playerScores.get(p.id) || 0;
        playerScores.set(p.id, current + scoreB);
      }
    });
  }

<<<<<<< HEAD
  // NUOVO ALGORITMO: Genera accoppiamenti intelligenti
  const intelligentMatches = generateIntelligentPairings(
    players,
    teammatePairs,
    opponentPairs,
    playerScores,
    playedCount
  );

  if (intelligentMatches.length === 0) {
    return { created: 0, reason: "no-possible-matches" as const };
  }

  const batch = db.batch();
  const createdMatches: any[] = [];

  // Crea le partite generate dall'algoritmo intelligente
  for (const match of intelligentMatches) {
=======
  // Ordina giocatori per numero di partite giocate (meno giocati prima)
  // Se stesso numero di partite, ordina per punteggio (più basso prima per bilanciamento)
  const sorted = players.slice().sort((p1, p2) => {
    const played1 = playedCount.get(p1.id || "") || 0;
    const played2 = playedCount.get(p2.id || "") || 0;
    
    if (played1 !== played2) return played1 - played2;
    
    // Se stesso numero di partite, bilancia per punteggio
    const score1 = playerScores.get(p1.id || "") || 0;
    const score2 = playerScores.get(p2.id || "") || 0;
    return score1 - score2;
  });

  const batch = db.batch();
  const createdMatches: any[] = [];
  const usedPlayers = new Set<string>();

  // Genera le partite per la giornata
  for (let matchIndex = 0; matchIndex < maxMatchesPerDay; matchIndex++) {
    // Trova 4 giocatori non ancora usati in questa giornata
    const availablePlayers = sorted.filter(p => !usedPlayers.has(p.id || ""));
    
    if (availablePlayers.length < 4) break;

    // Prendi i primi 4 giocatori disponibili
    const chosen = availablePlayers.slice(0, 4);
    const ids = chosen.map((x) => x.id || "");
    
    // Marca questi giocatori come usati per questa giornata
    ids.forEach(id => usedPlayers.add(id));

    // Per le giornate, permettiamo anche quartetti già usati se necessario
    // (il controllo existingQuartets viene fatto solo se abbiamo abbastanza giocatori alternativi)
    const quartetKey = sameQuartetKey(ids);
    if (players.length > 8 && existingQuartets.has(quartetKey)) {
      // Se abbiamo più di 8 giocatori, proviamo a trovare un quartetto alternativo
      const alternativePlayers = availablePlayers.slice(4);
      if (alternativePlayers.length >= 4) {
        // Prova con i prossimi 4 giocatori
        const altChosen = alternativePlayers.slice(0, 4);
        const altIds = altChosen.map((x) => x.id || "").filter(Boolean);
        const altQuartetKey = sameQuartetKey(altIds);
        
        if (!existingQuartets.has(altQuartetKey)) {
          // Usa il quartetto alternativo
          altIds.forEach(id => usedPlayers.add(id));
          const altPick = chooseTeamsAvoidingRepeats(altChosen, teammatePairs, playerScores);
          if (altPick) {
            const matchDoc = {
              phase: "campionato",
              status: "scheduled",
              createdAt: Timestamp.now(),
              date: "",
              time: "",
              place: "",
              teamA: altPick.teamA,
              teamB: altPick.teamB,
              matchday: nextMatchday,
              giornata: Date.now(),
            };
            const matchRef = db.collection("matches").doc();
            batch.set(matchRef, matchDoc);
            createdMatches.push({ id: matchRef.id, ...matchDoc });
            continue;
          }
        }
      }
      // Se non riusciamo a trovare un'alternativa, continuiamo con il quartetto originale
    }

    // Costruisci le squadre evitando coppie già viste
    const pick = chooseTeamsAvoidingRepeats(chosen, teammatePairs, playerScores);
    if (!pick) continue;

    // Crea la partita
>>>>>>> 306201e0856fab274e289508f745d6efcb6e0aab
    const matchDoc = {
      phase: "campionato",
      status: "scheduled",
      createdAt: Timestamp.now(),
      date: "",
      time: "",
      place: "",
<<<<<<< HEAD
      teamA: match.teamA,
      teamB: match.teamB,
=======
      teamA: pick.teamA,
      teamB: pick.teamB,
>>>>>>> 306201e0856fab274e289508f745d6efcb6e0aab
      matchday: nextMatchday,
      giornata: Date.now(), // Identificatore univoco per la giornata
    };

    const matchRef = db.collection("matches").doc();
    batch.set(matchRef, matchDoc);
    createdMatches.push({ id: matchRef.id, ...matchDoc });
  }

  if (createdMatches.length === 0) {
    return { created: 0, reason: "no-possible-matches" as const };
  }

  await batch.commit();
  return { created: createdMatches.length, matches: createdMatches };
}

/** =========================
 *  CALCOLO CLASSIFICA CAMPIONATO (usa status 'completed')
 *  ========================= */
async function finalizeCampionato(db: FirebaseFirestore.Firestore) {
  const snap = await db
    .collection("matches")
    .where("phase", "==", "campionato")
    .where("status", "==", "completed")
    .get();

  type Acc = { name: string; points: number; wins: number };
  const map = new Map<string, Acc>();

  const add = (pid: string, name: string, points: number, win: boolean) => {
    const cur = map.get(pid) || { name, points: 0, wins: 0 };
    cur.points += points;
    if (win) cur.wins += 1;
    map.set(pid, cur);
  };

  snap.forEach((d) => {
    const m = d.data() as any;
    const A: LightPlayer[] = (m.teamA || []).map(toLight);
    const B: LightPlayer[] = (m.teamB || []).map(toLight);
    const a = Number(m.scoreA || 0);
    const b = Number(m.scoreB || 0);
    const winA = a > b;
    const winB = b > a;

    A.forEach((p) => add(p.id || "", p.name, a, winA));
    B.forEach((p) => add(p.id || "", p.name, b, winB));
  });

  const items = Array.from(map.entries()).map(([playerId, v]) => ({
    playerId,
    name: v.name,
    points: v.points,
    wins: v.wins,
  }));

  items.sort((x, y) => {
    if (y.points !== x.points) return y.points - x.points;
    if (y.wins !== x.wins) return y.wins - x.wins;
    return x.name.localeCompare(y.name);
  });

  const batch = db.batch();
  const col = db.collection("standings_campionato");
  const old = await col.get();
  old.forEach((d) => batch.delete(d.ref));

  items.forEach((it, idx) => {
    if (it.playerId) {
      const ref = col.doc(it.playerId);
      batch.set(ref, { ...it, rank: idx + 1, frozenAt: Timestamp.now() });
    }
  });

  const cfgRef = db.collection("config").doc("tournament");
  batch.set(cfgRef, { phase: "campionato-completato", completedAt: Timestamp.now() }, { merge: true });

  await batch.commit();

  return { count: items.length };
}

/** =========================
 *  HANDLERS
 *  ========================= */
export async function GET() {
  const db = initAdmin();
  const phase = await detectPhase(db);
  return NextResponse.json({
    ok: true,
    route: "/api/admin/genera-giornata",
    phase,
    usage: {
      POST: "Genera una giornata completa del campionato con tutte le partite possibili.",
    },
  });
}

export async function POST() {
  try {
    const db = initAdmin();

    // Se il campionato è già completato → non genero, segnalo stato
    const phase = await detectPhase(db);
    if (phase === "campionato-completato") {
      return NextResponse.json({
        ok: true,
        phase,
        created: 0,
        message: "Campionato già completato. Classifica congelata.",
      });
    }

    // Provo a generare una giornata completa del campionato
    const res = await generateCampionatoGiornata(db);

    if (res.created > 0) {
      return NextResponse.json({
        ok: true,
        phase: "campionato",
        message: `Giornata generata con ${res.created} partite.`,
        created: res.created,
        matches: res.matches,
      });
    }

    if (res.reason === "not-enough-players") {
      return NextResponse.json({
        ok: true,
        phase: "campionato",
        created: 0,
        message: "Servono almeno 4 giocatori per generare una giornata.",
      });
    }

    if (res.reason === "incomplete-matches") {
      return NextResponse.json({
        ok: true,
        phase: "campionato",
        created: 0,
        message: res.message || "Ci sono partite senza punteggi. Inserisci tutti i risultati prima di generare una nuova giornata.",
        incompleteCount: res.incompleteCount
      });
    }

    if (res.reason === "campionato-completato") {
      const fin = await finalizeCampionato(db);
      return NextResponse.json({
        ok: true,
        phase: "campionato-completato",
        created: 0,
        message: res.message || `Campionato completato. Classifica congelata (${fin.count} giocatori).`,
      });
    }

    if (res.reason === "no-possible-matches") {
      const fin = await finalizeCampionato(db);
      return NextResponse.json({
        ok: true,
        phase: "campionato-completato",
        created: 0,
        message: `Campionato completato. Classifica congelata (${fin.count} giocatori).`,
      });
    }

    return NextResponse.json({
      ok: true,
      phase: "campionato",
      created: 0,
      message: "Nessuna giornata generata.",
    });
  } catch (err: any) {
    console.error("ERRORE /api/admin/genera-giornata:", err);
    return new NextResponse(err?.message || "Errore interno", { status: 500 });
  }
}
