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
    name: p?.username ?? p?.name ?? p?.Nome ?? p?.displayName ?? p?.id ?? "??",
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

/**
 * Calcola il peso di una partita basato sulle priorità - VERSIONE MIGLIORATA
 */
function calculateMatchWeight(
  teamA: LightPlayer[],
  teamB: LightPlayer[],
  teammatePairs: Set<string>,
  opponentPairs: Set<string>,
  playerScores: Map<string, number>,
  playerGames?: Map<string, { gamesWon: number; gamesLost: number }>
): number {
  let weight = 0;
  
  // PRIORITÀ 1: Compagni ripetuti (IMPOSSIBILE quando possibile, PENALITÀ MASSIMA altrimenti)
  const pairKeyA = pairKey(teamA[0].id || "", teamA[1].id || "");
  const pairKeyB = pairKey(teamB[0].id || "", teamB[1].id || "");
  
  let repeatedTeammates = 0;
  if (teammatePairs.has(pairKeyA)) repeatedTeammates++;
  if (teammatePairs.has(pairKeyB)) repeatedTeammates++;
  
  if (repeatedTeammates > 0) {
    // Controlla se abbiamo alternative disponibili
    const totalMatchesPlayed = teammatePairs.size / 2; // Approssimativo
    if (totalMatchesPlayed < 60) { // Prime 15 giornate, cerca di evitare ripetizioni
      return Infinity; // IMPOSSIBILE - cerca alternative
    } else {
      weight += 10000 * repeatedTeammates; // PENALITÀ MASSIMA ma accettabile
    }
  }
  
  // PRIORITÀ 2: Differenza punteggi tra squadre (moltiplicata per 100)
  const scoreA = (playerScores.get(teamA[0].id || "") || 0) + (playerScores.get(teamA[1].id || "") || 0);
  const scoreB = (playerScores.get(teamB[0].id || "") || 0) + (playerScores.get(teamB[1].id || "") || 0);
  const scoreDifference = Math.abs(scoreA - scoreB);
  weight += scoreDifference * 100;
  
  // PRIORITÀ 2.5: Differenza game tra squadre (se disponibile)
  if (playerGames) {
    const gamesA = (playerGames.get(teamA[0].id || "")?.gamesWon || 0) + (playerGames.get(teamA[1].id || "")?.gamesWon || 0);
    const gamesB = (playerGames.get(teamB[0].id || "")?.gamesWon || 0) + (playerGames.get(teamB[1].id || "")?.gamesWon || 0);
    const gameDifference = Math.abs(gamesA - gamesB);
    weight += gameDifference * 2; // Peso minore rispetto ai punteggi
  }
  
  // PRIORITÀ 3: Avversari ripetuti (penalità progressiva)
  let opponentRepeatCount = 0;
  for (const playerA of teamA) {
    for (const playerB of teamB) {
      const opponentKey = pairKey(playerA.id || "", playerB.id || "");
      if (opponentPairs.has(opponentKey)) {
        opponentRepeatCount++;
      }
    }
  }
  
  // Penalità progressiva per avversari ripetuti
  if (opponentRepeatCount > 0) {
    weight += opponentRepeatCount * 50; // 50 per ogni coppia di avversari ripetuti
  }
  
  // BONUS: Punteggi molto simili (differenza 0-1)
  if (scoreDifference <= 1) {
    weight -= 20; // Bonus per partite bilanciate
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
  playerScores: Map<string, number>,
  playerGames?: Map<string, { gamesWon: number; gamesLost: number }>
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
      playerScores,
      playerGames
    );
    
    // Salta completamente i candidati impossibili (weight = Infinity)
    if (weight === Infinity) {
      console.log(`❌ Combinazione IMPOSSIBILE saltata: ${combo.teamA.map(p => p.name).join(',')} vs ${combo.teamB.map(p => p.name).join(',')}`);
      continue;
    }
    
    // Log delle combinazioni con compagni ripetuti per debug
    if (weight >= 10000) {
      console.log(`⚠️ Combinazione con compagni ripetuti (peso: ${weight}): ${combo.teamA.map(p => p.name).join(',')} vs ${combo.teamB.map(p => p.name).join(',')}`);
    }
    
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
 * Genera tutte le possibili combinazioni di 4 giocatori
 */
function generateAllCombinations(players: LightPlayer[]): LightPlayer[][] {
  const combinations: LightPlayer[][] = [];
  
  for (let i = 0; i < players.length - 3; i++) {
    for (let j = i + 1; j < players.length - 2; j++) {
      for (let k = j + 1; k < players.length - 1; k++) {
        for (let l = k + 1; l < players.length; l++) {
          combinations.push([players[i], players[j], players[k], players[l]]);
        }
      }
    }
  }
  
  return combinations;
}

/**
 * FASE 1: Genera calendario perfetto delle coppie (0 ripetizioni garantite)
 * Distribuisce le 120 coppie in 15 giornate senza mai ripetere compagni
 */
function generatePerfectPairingCalendar(players: LightPlayer[]): { teamA: LightPlayer[], teamB: LightPlayer[] }[][] {
  const allDays: { teamA: LightPlayer[], teamB: LightPlayer[] }[][] = [];
  const usedPairs = new Set<string>();
  const playerIds = players.map(p => p.id || "");
  
  console.log(`🎯 FASE 1: Generando calendario perfetto delle coppie per ${players.length} giocatori`);
  
  // Per ogni giornata, crea 4 partite con coppie mai usate
  for (let day = 0; day < 15; day++) {
    const dayMatches: { teamA: LightPlayer[], teamB: LightPlayer[] }[] = [];
    const usedToday = new Set<string>();
    
    // Crea 4 partite per questa giornata
    for (let match = 0; match < 4; match++) {
      const availablePlayers = playerIds.filter(id => !usedToday.has(id));
      
      if (availablePlayers.length < 4) break;
      
      // Trova una combinazione di 4 giocatori con coppie mai usate
      let foundMatch = false;
      
      // Prova diverse combinazioni
      for (let i = 0; i < availablePlayers.length - 3 && !foundMatch; i++) {
        for (let j = i + 1; j < availablePlayers.length - 2 && !foundMatch; j++) {
          for (let k = j + 1; k < availablePlayers.length - 1 && !foundMatch; k++) {
            for (let l = k + 1; l < availablePlayers.length && !foundMatch; l++) {
              const p1 = players.find(p => p.id === availablePlayers[i])!;
              const p2 = players.find(p => p.id === availablePlayers[j])!;
              const p3 = players.find(p => p.id === availablePlayers[k])!;
              const p4 = players.find(p => p.id === availablePlayers[l])!;
              
              // Prova le 3 possibili combinazioni di squadre
              const combinations = [
                { teamA: [p1, p2], teamB: [p3, p4] },
                { teamA: [p1, p3], teamB: [p2, p4] },
                { teamA: [p1, p4], teamB: [p2, p3] }
              ];
              
              for (const combo of combinations) {
                const pair1 = pairKey(combo.teamA[0].id || "", combo.teamA[1].id || "");
                const pair2 = pairKey(combo.teamB[0].id || "", combo.teamB[1].id || "");
                
                if (!usedPairs.has(pair1) && !usedPairs.has(pair2)) {
                  // Trovata combinazione valida!
                  dayMatches.push(combo);
                  
                  // Marca le coppie come usate
                  usedPairs.add(pair1);
                  usedPairs.add(pair2);
                  
                  // Marca i giocatori come usati oggi
                  combo.teamA.forEach(p => usedToday.add(p.id || ""));
                  combo.teamB.forEach(p => usedToday.add(p.id || ""));
                  
                  console.log(`Giornata ${day + 1}, Partita ${match + 1}: ${combo.teamA.map(p => p.name).join(',')} vs ${combo.teamB.map(p => p.name).join(',')}`);
                  foundMatch = true;
                  break;
                }
              }
            }
          }
        }
      }
      
      if (!foundMatch) {
        console.log(`⚠️ Giornata ${day + 1}: Impossibile creare partita ${match + 1} senza ripetere coppie`);
        break;
      }
    }
    
    if (dayMatches.length > 0) {
      allDays.push(dayMatches);
    } else {
      console.log(`❌ Giornata ${day + 1}: Nessuna partita possibile`);
      break;
    }
  }
  
  console.log(`✅ FASE 1 completata: ${allDays.length} giornate, ${usedPairs.size} coppie utilizzate`);
  return allDays;
}

/**
 * FASE 2-4: Assegna avversari ottimizzando punteggi, game e varietà
 */
function optimizeOpponents(
  dayMatches: { teamA: LightPlayer[], teamB: LightPlayer[] }[],
  playerScores: Map<string, number>,
  playerGames: Map<string, { gamesWon: number; gamesLost: number }>,
  opponentPairs: Set<string>
): MatchCandidate[] {
  const optimizedMatches: MatchCandidate[] = [];
  
  console.log(`🎯 FASE 2-4: Ottimizzando avversari per ${dayMatches.length} partite`);
  
  for (const match of dayMatches) {
    // Calcola punteggi delle squadre
    const scoreA = (playerScores.get(match.teamA[0].id || "") || 0) + 
                   (playerScores.get(match.teamA[1].id || "") || 0);
    const scoreB = (playerScores.get(match.teamB[0].id || "") || 0) + 
                   (playerScores.get(match.teamB[1].id || "") || 0);
    
    // FASE 3: Se punteggi uguali, usa game per determinare forza
    let teamAStrength = scoreA;
    let teamBStrength = scoreB;
    
    if (scoreA === scoreB) {
      const gamesA = (playerGames.get(match.teamA[0].id || "")?.gamesWon || 0) + 
                     (playerGames.get(match.teamA[1].id || "")?.gamesWon || 0);
      const gamesB = (playerGames.get(match.teamB[0].id || "")?.gamesWon || 0) + 
                     (playerGames.get(match.teamB[1].id || "")?.gamesWon || 0);
      
      teamAStrength = scoreA + (gamesA / 100); // Aggiungi game come tie-breaker
      teamBStrength = scoreB + (gamesB / 100);
    }
    
    // FASE 4: Calcola penalità per compagni ripetuti (non avversari)
    let teammateRepeatPenalty = 0;
    
    // Controlla se i compagni della squadra A sono già stati compagni
    const teamAKey = pairKey(match.teamA[0].id || "", match.teamA[1].id || "");
    if (opponentPairs.has(teamAKey)) {
      teammateRepeatPenalty += 1000; // Penalità alta per compagni ripetuti
    }
    
    // Controlla se i compagni della squadra B sono già stati compagni
    const teamBKey = pairKey(match.teamB[0].id || "", match.teamB[1].id || "");
    if (opponentPairs.has(teamBKey)) {
      teammateRepeatPenalty += 1000; // Penalità alta per compagni ripetuti
    }
    
    // Calcola peso finale
    const scoreDifference = Math.abs(teamAStrength - teamBStrength);
    const weight = (scoreDifference * 100) + teammateRepeatPenalty;
    
    optimizedMatches.push({
      teamA: match.teamA,
      teamB: match.teamB,
      weight: weight,
      scoreA: scoreA,
      scoreB: scoreB
    });
    
    console.log(`Partita ottimizzata: ${match.teamA.map(p => p.name).join(',')} vs ${match.teamB.map(p => p.name).join(',')} - Peso: ${weight.toFixed(2)}`);
  }
  
  return optimizedMatches;
}

/**
 * Algoritmo di fallback per generare accoppiamenti intelligenti
 * Usato quando il calendario perfetto non è disponibile
 */
function generateIntelligentPairings(
  players: LightPlayer[],
  teammatePairs: Set<string>,
  opponentPairs: Set<string>,
  playerScores: Map<string, number>,
  playedCount: Map<string, number>,
  playerGames?: Map<string, { gamesWon: number; gamesLost: number }>
): MatchCandidate[] {
  const matches: MatchCandidate[] = [];
  const usedPlayers = new Set<string>();
  
  // Ordina i giocatori per numero di partite giocate (meno partite = priorità)
  const sortedPlayers = players
    .map(p => ({ ...p, matchesPlayed: playedCount.get(p.id || "") || 0 }))
    .sort((a, b) => a.matchesPlayed - b.matchesPlayed);
  
  // Genera esattamente 4 partite per giornata (16 giocatori ÷ 4 = 4 partite)
  const maxMatchesPerDay = Math.floor(players.length / 4); // 4 partite per 16 giocatori
  
  for (let matchIndex = 0; matchIndex < maxMatchesPerDay; matchIndex++) {
    // Trova giocatori non ancora usati
    const availablePlayers = sortedPlayers.filter(p => !usedPlayers.has(p.id || ""));
    
    if (availablePlayers.length < 4) {
      console.log(`❌ Non abbastanza giocatori disponibili per la partita ${matchIndex + 1}: ${availablePlayers.length} disponibili, 4 necessari`);
      break;
    }
    
    // Genera TUTTE le possibili combinazioni di 4 giocatori disponibili
    const allCombinations = generateAllCombinations(availablePlayers);
    
    // Valuta ogni combinazione e trova la migliore
    let bestMatch: MatchCandidate | null = null;
    let bestPlayers: LightPlayer[] = [];
    let bestScore = Infinity;
    
    for (const combination of allCombinations) {
      const match = generateBestMatch(combination, teammatePairs, opponentPairs, playerScores, playerGames);
      
      if (match) {
        // Calcola un punteggio composito che considera:
        // 1. Peso della partita (compagni ripetuti, punteggi, avversari)
        // 2. Numero di partite giocate dai giocatori (bilanciamento)
        const playerBalance = combination.reduce((sum, p) => {
          return sum + (playedCount.get(p.id || "") || 0);
        }, 0);
        
        // Punteggio finale: peso della partita + bilanciamento giocatori
        const totalScore = match.weight + (playerBalance * 0.1);
        
        if (totalScore < bestScore) {
          bestScore = totalScore;
          bestMatch = match;
          bestPlayers = combination;
        }
      }
    }
    
    // Se non troviamo nessuna combinazione, usa i primi 4 giocatori disponibili
    if (!bestMatch) {
      console.log(`⚠️ Nessuna combinazione trovata per la partita ${matchIndex + 1}, usando i primi 4 giocatori disponibili`);
      
      const fallbackMatch = generateBestMatch(availablePlayers.slice(0, 4), teammatePairs, opponentPairs, playerScores, playerGames);
      if (fallbackMatch) {
        bestMatch = fallbackMatch;
        bestPlayers = availablePlayers.slice(0, 4);
        console.log(`🔄 Usando combinazione di fallback: ${bestPlayers.map(p => p.name).join(', ')} - Peso: ${bestMatch.weight}`);
      } else {
        console.log(`❌ Impossibile generare una partita per la partita ${matchIndex + 1}`);
        break;
      }
    }
    
    // Aggiungi la partita e marca i giocatori come usati
    matches.push(bestMatch);
    bestPlayers.forEach(p => usedPlayers.add(p.id || ""));
    
    console.log(`Partita ${matches.length}: ${bestPlayers.map(p => p.name).join(', ')} - Peso: ${bestMatch.weight}, Score: ${bestScore.toFixed(2)}`);
  }
  
  // CONTROLLO FINALE: Verifica che tutti i giocatori siano stati usati esattamente una volta
  const unusedPlayers = players.filter(p => !usedPlayers.has(p.id || ""));
  if (unusedPlayers.length > 0) {
    console.log(`⚠️ ATTENZIONE: ${unusedPlayers.length} giocatori non sono stati assegnati: ${unusedPlayers.map(p => p.name).join(', ')}`);
  }
  
  if (matches.length !== maxMatchesPerDay) {
    console.log(`⚠️ ATTENZIONE: Generate ${matches.length} partite invece di ${maxMatchesPerDay} per ${players.length} giocatori`);
  }
  
  console.log(`✅ Giornata completata: ${matches.length} partite, ${usedPlayers.size}/${players.length} giocatori utilizzati`);
  
  return matches;
}

/** =========================
 *  CALCOLO CLASSIFICA ATTUALE
 *  ========================= */
async function calculateCurrentStandings(db: FirebaseFirestore.Firestore) {
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

  for (const doc of snap.docs) {
    const m = doc.data() as any;
    const a: LightPlayer[] = (m.teamA || []).map(toLight);
    const b: LightPlayer[] = (m.teamB || []).map(toLight);
    
    if (a.length >= 2 && b.length >= 2 && typeof m.scoreA === "number" && typeof m.scoreB === "number") {
      const aWins = m.scoreA > m.scoreB;
      const pointsA = aWins ? 3 : (m.scoreA === m.scoreB ? 1 : 0);
      const pointsB = !aWins ? 3 : (m.scoreA === m.scoreB ? 1 : 0);
      
      add(a[0].id || "", a[0].name, pointsA, aWins);
      add(a[1].id || "", a[1].name, pointsA, aWins);
      add(b[0].id || "", b[0].name, pointsB, !aWins);
      add(b[1].id || "", b[1].name, pointsB, !aWins);
    }
  }

  return Array.from(map.entries()).map(([playerId, v]) => ({
    playerId,
    name: v.name,
    points: v.points,
    wins: v.wins,
  }));
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

  // Calcola la classifica attuale per ottenere i punteggi corretti
  const standings = await calculateCurrentStandings(db);
  
  // Aggiorna i punteggi dei giocatori con quelli della classifica attuale
  const playersWithCurrentPoints = players.map(player => ({
    ...player,
    points: standings.find(s => s.playerId === player.id)?.points || 0
  }));

  // storico campionato
  const matchesSnap = await db.collection("matches").where("phase", "==", "campionato").get();
  const matches = matchesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

  // Calcola il prossimo matchday: ogni 4 partite = 1 giornata (16 giocatori = 4 partite per giornata)
  const totalMatches = matches.length;
  const nextMatchday = Math.floor(totalMatches / 4) + 1;

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
  for (const p of playersWithCurrentPoints) {
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
  
  // CONTROLLO: Massimo 15 giornate per 16 giocatori (ogni giocatore deve giocare con tutti gli altri)
  const maxMatchdays = players.length - 1; // 15 giornate per 16 giocatori
  const currentMatchday = Math.floor(totalMatches / 4);
  
  if (currentMatchday >= maxMatchdays) {
    return { 
      created: 0, 
      reason: "campionato-completato" as const,
      message: `Campionato completato. Raggiunto il massimo di ${maxMatchdays} giornate per ${players.length} giocatori.`
    };
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
  const opponentPairs = new Set<string>();
  const existingQuartets = new Set<string>();
  for (const p of players) playedCount.set(p.id || "", 0);

  for (const m of matches) {
    const a: LightPlayer[] = (m.teamA || []).map(toLight);
    const b: LightPlayer[] = (m.teamB || []).map(toLight);
    const ids = [...a, ...b].map((x) => x.id || "").filter(Boolean);
    if (ids.length === 4) existingQuartets.add(sameQuartetKey(ids));
    for (const pid of ids) playedCount.set(pid, (playedCount.get(pid) || 0) + 1);
    
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
  }

  // Calcola quante partite possiamo creare
  const numPlayers = players.length;
  const maxMatchesPerDay = Math.floor(numPlayers / 4);
  
  if (maxMatchesPerDay === 0) {
    return { created: 0, reason: "not-enough-players" as const };
  }

  // Calcola punteggi attuali per bilanciamento
  const playerScores = new Map<string, number>();
  const playerGames = new Map<string, { gamesWon: number; gamesLost: number }>();
  for (const p of players) {
    playerScores.set(p.id || "", 0);
    playerGames.set(p.id || "", { gamesWon: 0, gamesLost: 0 });
  }
  
  // Somma i punteggi e game dalle partite completate
  for (const m of completedMatches) {
    const a: LightPlayer[] = (m.teamA || []).map(toLight);
    const b: LightPlayer[] = (m.teamB || []).map(toLight);
    const scoreA = Number(m.scoreA || 0);
    const scoreB = Number(m.scoreB || 0);
    const gamesA = Number(m.totalGamesA || 0);
    const gamesB = Number(m.totalGamesB || 0);
    
    a.forEach(p => {
      if (p.id) {
        const currentScore = playerScores.get(p.id) || 0;
        playerScores.set(p.id, currentScore + scoreA);
        
        const currentGames = playerGames.get(p.id) || { gamesWon: 0, gamesLost: 0 };
        playerGames.set(p.id, {
          gamesWon: currentGames.gamesWon + gamesA,
          gamesLost: currentGames.gamesLost + gamesB
        });
      }
    });
    
    b.forEach(p => {
      if (p.id) {
        const currentScore = playerScores.get(p.id) || 0;
        playerScores.set(p.id, currentScore + scoreB);
        
        const currentGames = playerGames.get(p.id) || { gamesWon: 0, gamesLost: 0 };
        playerGames.set(p.id, {
          gamesWon: currentGames.gamesWon + gamesB,
          gamesLost: currentGames.gamesLost + gamesA
        });
      }
    });
  }

  // NUOVO ALGORITMO: Usa coppie predefinite dal calendario
  let intelligentMatches: MatchCandidate[] = [];
  
  const totalMatchesPlayed = completedMatches.length;
  const currentDayIndex = Math.floor(totalMatchesPlayed / 4);
  
  console.log(`🎯 ALGORITMO COPPIE PREDEFINITE: Giornata ${currentDayIndex + 1} (${totalMatchesPlayed} partite giocate)`);
  
  // FASE 1: Prova a usare il calendario delle coppie predefinite
  try {
    const calendarDoc = await db.collection('pair_calendar').doc('calendar').get();
    
    if (calendarDoc.exists) {
      const calendarData = calendarDoc.data();
      const calendar = calendarData?.calendar || [];
      
      if (calendar.length > currentDayIndex) {
        const dayPairs = calendar[currentDayIndex];
        console.log(`✅ Calendario trovato: Giornata ${currentDayIndex + 1} con ${dayPairs.pairs.length} coppie predefinite`);
        
        // FASE 2-4: Ottimizza avversari per punteggi, game e varietà
        intelligentMatches = optimizeOpponents(dayPairs.pairs, playerScores, playerGames, opponentPairs);
        console.log(`✅ FASE 2-4 completata: ${intelligentMatches.length} partite ottimizzate`);
      } else {
        console.log(`⚠️ Calendario non ha abbastanza giornate: ${calendar.length} disponibili, giornata ${currentDayIndex + 1} richiesta`);
      }
    } else {
      console.log("⚠️ Calendario delle coppie non trovato");
    }
  } catch (error) {
    console.log("⚠️ Errore nel recupero del calendario:", error);
  }
  
  // Fallback: Se il calendario non funziona, usa algoritmo intelligente tradizionale
  if (intelligentMatches.length === 0) {
    console.log("🔄 Fallback: Usando algoritmo intelligente tradizionale");
    intelligentMatches = generateIntelligentPairings(
      playersWithCurrentPoints,
      teammatePairs,
      opponentPairs,
      playerScores,
      playedCount,
      playerGames
    );
  }

  if (intelligentMatches.length === 0) {
    return { created: 0, reason: "no-possible-matches" as const };
  }

  const batch = db.batch();
  const createdMatches: any[] = [];

  // Crea le partite generate dall'algoritmo intelligente
  for (const match of intelligentMatches) {
    const matchDoc = {
      phase: "campionato",
      status: "scheduled",
      createdAt: Timestamp.now(),
      date: "",
      time: "",
      place: "",
      teamA: match.teamA,
      teamB: match.teamB,
      matchday: nextMatchday,
      giornata: Date.now(), // Identificatore univoco per la giornata
      // Salva i punteggi al momento della generazione per il log
      generationPoints: {
        teamA: {
          player1: { id: match.teamA[0].id, name: match.teamA[0].name, points: match.teamA[0].points || 0 },
          player2: { id: match.teamA[1].id, name: match.teamA[1].name, points: match.teamA[1].points || 0 },
          total: (match.teamA[0].points || 0) + (match.teamA[1].points || 0)
        },
        teamB: {
          player1: { id: match.teamB[0].id, name: match.teamB[0].name, points: match.teamB[0].points || 0 },
          player2: { id: match.teamB[1].id, name: match.teamB[1].name, points: match.teamB[1].points || 0 },
          total: (match.teamB[0].points || 0) + (match.teamB[1].points || 0)
        }
      }
    };

    const matchRef = db.collection("matches").doc();
    batch.set(matchRef, matchDoc);
    createdMatches.push({ id: matchRef.id, ...matchDoc });
  }

  if (createdMatches.length === 0) {
    return { created: 0, reason: "no-possible-matches" as const };
  }

  // CONTROLLO: Verifica che non vengano generate più di 4 partite per giornata
  if (createdMatches.length > 4) {
    console.error(`❌ ERRORE: Generate ${createdMatches.length} partite invece di 4 per giornata ${nextMatchday}`);
    return { created: 0, reason: "too-many-matches" as const, message: `Errore: generate ${createdMatches.length} partite invece di 4` };
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
