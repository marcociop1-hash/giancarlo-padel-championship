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
    
    // FASE 4: Calcola penalità per avversari ripetuti
    let opponentRepeatPenalty = 0;
    for (const playerA of match.teamA) {
      for (const playerB of match.teamB) {
        const opponentKey = pairKey(playerA.id || "", playerB.id || "");
        if (opponentPairs.has(opponentKey)) {
          opponentRepeatPenalty += 50; // Penalità per avversari ripetuti
        }
      }
    }
    
    // Calcola peso finale
    const scoreDifference = Math.abs(teamAStrength - teamBStrength);
    const weight = (scoreDifference * 100) + opponentRepeatPenalty;
    
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

  const add = (pid: string, name: string, setsWon: number) => {
    const cur = map.get(pid) || { name, points: 0, wins: 0 };
    // I punti nella classifica sono calcolati come: 1 punto per ogni set vinto
    cur.points += setsWon;
    map.set(pid, cur);
  };

  for (const doc of snap.docs) {
    const m = doc.data() as any;
    const a: LightPlayer[] = (m.teamA || []).map(toLight);
    const b: LightPlayer[] = (m.teamB || []).map(toLight);
    
    if (a.length >= 2 && b.length >= 2 && typeof m.scoreA === "number" && typeof m.scoreB === "number") {
      // scoreA e scoreB rappresentano i set vinti da ogni squadra
      // I punti sono calcolati come: 1 punto per ogni set vinto
      const setsWonA = m.scoreA || 0;
      const setsWonB = m.scoreB || 0;
      
      add(a[0].id || "", a[0].name, setsWonA);
      add(a[1].id || "", a[1].name, setsWonA);
      add(b[0].id || "", b[0].name, setsWonB);
      add(b[1].id || "", b[1].name, setsWonB);
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

  // Leggi la classifica direttamente dal database o calcolala dalle partite
  // Usa la stessa logica di app/lib/standings.ts per garantire coerenza
  const matchesSnapForStandings = await db
    .collection("matches")
    .where("phase", "==", "campionato")
    .where("status", "==", "completed")
    .get();

  // Calcola classifica con la stessa logica della UI
  const standingsMap = new Map<string, {
    playerId: string;
    name: string;
    points: number; // P: punti (1 per ogni set vinto)
    gamesWon: number; // GV: game vinti
    gamesLost: number; // GP: game persi
    setsWon: number;
    setsLost: number;
  }>();

  const ensureStanding = (playerId: string, name: string) => {
    if (!standingsMap.has(playerId)) {
      standingsMap.set(playerId, {
        playerId,
        name,
        points: 0,
        gamesWon: 0,
        gamesLost: 0,
        setsWon: 0,
        setsLost: 0
      });
    }
    return standingsMap.get(playerId)!;
  };

  // Calcola classifica dalle partite completate
  for (const doc of matchesSnapForStandings.docs) {
    const m = doc.data() as any;
    const teamA = m.teamA || [];
    const teamB = m.teamB || [];
    
    if (teamA.length < 2 || teamB.length < 2) continue;
    
    // Calcola set vinti da ogni squadra
    let setsWonA = 0;
    let setsWonB = 0;
    
    // Se ci sono i set nel formato array
    if (m.sets && Array.isArray(m.sets)) {
      for (const s of m.sets) {
        if (Array.isArray(s)) {
          const [ga, gb] = s;
          if (typeof ga === 'number' && typeof gb === 'number' && ga !== gb) {
            if (ga > gb) setsWonA += 1;
            else setsWonB += 1;
          }
        } else if (s && (s as any).winner) {
          if ((s as any).winner === 'A') setsWonA += 1;
          if ((s as any).winner === 'B') setsWonB += 1;
        }
      }
    } else {
      // Fallback: usa scoreA e scoreB come set vinti
      setsWonA = Number(m.scoreA || 0);
      setsWonB = Number(m.scoreB || 0);
    }
    
    // Calcola game vinti
    const gamesWonA = Number(m.totalGamesA || 0);
    const gamesWonB = Number(m.totalGamesB || 0);
    
    // Aggiorna statistiche per team A
    for (const p of teamA) {
      const playerId = p.id || p.uid || '';
      const playerName = p.name || p.username || p.displayName || '';
      if (playerId) {
        const s = ensureStanding(playerId, playerName);
        s.points += setsWonA; // 1 punto per ogni set vinto
        s.setsWon += setsWonA;
        s.setsLost += setsWonB;
        s.gamesWon += gamesWonA;
        s.gamesLost += gamesWonB;
      }
    }
    
    // Aggiorna statistiche per team B
    for (const p of teamB) {
      const playerId = p.id || p.uid || '';
      const playerName = p.name || p.username || p.displayName || '';
      if (playerId) {
        const s = ensureStanding(playerId, playerName);
        s.points += setsWonB; // 1 punto per ogni set vinto
        s.setsWon += setsWonB;
        s.setsLost += setsWonA;
        s.gamesWon += gamesWonB;
        s.gamesLost += gamesWonA;
      }
    }
  }
  
  // Converti in array
  const standings = Array.from(standingsMap.values());
  
  // Aggiorna i punteggi e game dei giocatori con quelli della classifica
  const playersWithCurrentPoints = players.map(player => {
    const standing = standings.find(s => s.playerId === player.id);
    return {
      ...player,
      points: standing?.points || 0,
      gamesWon: standing?.gamesWon || 0
    };
  });

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

  // Usa i punteggi e game già calcolati dalla classifica
  const playerScores = new Map<string, number>();
  const playerGames = new Map<string, { gamesWon: number; gamesLost: number }>();
  
  // Popola le mappe con i dati dalla classifica calcolata
  for (const standing of standings) {
    playerScores.set(standing.playerId, standing.points);
    playerGames.set(standing.playerId, { 
      gamesWon: standing.gamesWon, 
      gamesLost: standing.gamesLost
    });
  }
  
  // Assicurati che tutti i giocatori siano nella mappa (anche quelli senza partite)
  for (const p of players) {
    if (!playerScores.has(p.id || "")) {
      playerScores.set(p.id || "", 0);
      playerGames.set(p.id || "", { gamesWon: 0, gamesLost: 0 });
    }
  }

  // NUOVO ALGORITMO: Usa coppie predefinite dal calendario + Ottimizzazione avversari
  let intelligentMatches: MatchCandidate[] = [];
  
  const totalMatchesPlayed = completedMatches.length;
  const currentDayIndex = Math.floor(totalMatchesPlayed / 4);
  // nextMatchday è già definito sopra (riga 549)
  
  console.log(`🎯 ALGORITMO CON CALENDARIO PREDEFINITO: Giornata ${nextMatchday} (${totalMatchesPlayed} partite giocate)`);
  
  // FASE 1: Leggi le coppie predefinite dal calendario per questa giornata
  try {
    const calendarDoc = await db.collection('pair_calendar').doc('calendar').get();
    
    if (calendarDoc.exists) {
      const calendarData = calendarDoc.data();
      const calendar = calendarData?.calendar || [];
      
      // Trova la giornata corrispondente (l'indice è 0-based, il matchday è 1-based)
      const dayIndex = nextMatchday - 1;
      
      if (calendar.length > dayIndex && calendar[dayIndex]) {
        const dayData = calendar[dayIndex];
        const predefinedPairs = dayData.pairs || [];
        
        console.log(`📅 Calendario trovato: Giornata ${nextMatchday}, ${predefinedPairs.length} coppie predefinite`);
        
        if (predefinedPairs.length >= 4) {
          // Converti le coppie predefinite in formato LightPlayer
          const pairsAsLightPlayers: LightPlayer[][] = [];
          
          for (const pair of predefinedPairs) {
            // La struttura è: { teamA: [{ id: "...", name: "..." }, { id: "...", name: "..." }] }
            const teamA = pair.teamA || [];
            
            // Converti gli oggetti giocatore in LightPlayer con punteggi aggiornati
            const convertedPair: LightPlayer[] = [];
            for (const playerObj of teamA) {
              if (playerObj && playerObj.id) {
                // Trova il giocatore con punteggi aggiornati
                const foundPlayer = playersWithCurrentPoints.find(p => p.id === playerObj.id);
                if (foundPlayer) {
                  convertedPair.push(foundPlayer);
                } else {
                  // Se non trovato, usa i dati base
                  convertedPair.push(toLight(playerObj));
                }
              } else if (typeof playerObj === 'string') {
                // Fallback: se è una stringa (nome), cerca per nome
                const foundPlayer = playersWithCurrentPoints.find(p => {
                  const pName = (p.name || '').toLowerCase();
                  const searchName = playerObj.toLowerCase();
                  return pName === searchName || 
                         pName.includes(searchName) || 
                         searchName.includes(pName);
                });
                
                if (foundPlayer) {
                  convertedPair.push(foundPlayer);
                } else {
                  console.warn(`⚠️ Giocatore non trovato: ${playerObj}`);
                }
              } else {
                convertedPair.push(toLight(playerObj));
              }
            }
            
            if (convertedPair.length === 2) {
              pairsAsLightPlayers.push(convertedPair);
              console.log(`   ✅ Coppia: ${convertedPair[0].name} + ${convertedPair[1].name}`);
            } else {
              console.warn(`⚠️ Coppia non valida: ${convertedPair.length} giocatori invece di 2`);
            }
          }
          
          if (pairsAsLightPlayers.length >= 4) {
            console.log(`✅ ${pairsAsLightPlayers.length} coppie convertite correttamente`);
            
            // NUOVO ALGORITMO: Ordina per punteggio totale e accoppia in sequenza
            // Con permutazioni quando ci sono pareggi per minimizzare incontri precedenti
            
            // Calcola punteggi totali per ogni coppia
            const pairsWithScores = pairsAsLightPlayers.map((pair, index) => {
              const score1 = (pair[0].points || 0);
              const score2 = (pair[1].points || 0);
              const totalScore = score1 + score2;
              return {
                pair,
                totalScore,
                index
              };
            });
            
            // Ordina per punteggio totale (decrescente)
            pairsWithScores.sort((a, b) => {
              if (b.totalScore !== a.totalScore) {
                return b.totalScore - a.totalScore;
              }
              // In caso di pareggio, ordina per nome (per stabilità)
              const nameA = (a.pair[0].name || '').toLowerCase();
              const nameB = (b.pair[0].name || '').toLowerCase();
              return nameA.localeCompare(nameB);
            });
            
            console.log(`🔄 Coppie ordinate per punteggio totale:`);
            pairsWithScores.forEach((p, idx) => {
              const p1Score = p.pair[0].points || 0;
              const p2Score = p.pair[1].points || 0;
              console.log(`   ${idx + 1}. ${p.pair[0].name}(${p1Score}) + ${p.pair[1].name}(${p2Score}) = ${p.totalScore}`);
            });
            
            // Funzione per contare gli incontri precedenti tra due coppie
            function countOpponentMatches(pair1: LightPlayer[], pair2: LightPlayer[]): number {
              let count = 0;
              for (const p1 of pair1) {
                for (const p2 of pair2) {
                  const key = pairKey(p1.id || "", p2.id || "");
                  if (opponentPairs.has(key)) {
                    count++;
                  }
                }
              }
              return count;
            }
            
            // Funzione per trovare il miglior avversario per una coppia data
            function findBestOpponent(pairIndex: number, startFromIndex: number, usedPairs: Set<number>): number {
              const currentPair = pairsWithScores[pairIndex].pair;
              const currentScore = pairsWithScores[pairIndex].totalScore;
              
              // Trova tutte le coppie disponibili con lo stesso punteggio
              const sameScoreOpponents: { index: number; matches: number }[] = [];
              // Trova anche tutte le altre coppie disponibili
              const otherOpponents: { index: number; matches: number; score: number }[] = [];
              
              for (let j = startFromIndex; j < pairsWithScores.length; j++) {
                if (usedPairs.has(j)) continue;
                
                const opponentScore = pairsWithScores[j].totalScore;
                const matchesCount = countOpponentMatches(currentPair, pairsWithScores[j].pair);
                
                if (opponentScore === currentScore) {
                  // Stesso punteggio: priorità alta
                  sameScoreOpponents.push({ index: j, matches: matchesCount });
                } else {
                  // Punteggio diverso: priorità bassa
                  otherOpponents.push({ index: j, matches: matchesCount, score: opponentScore });
                }
              }
              
              // Se ci sono coppie con lo stesso punteggio, scegli quella con meno incontri
              if (sameScoreOpponents.length > 0) {
                sameScoreOpponents.sort((a, b) => a.matches - b.matches);
                console.log(`   🔍 Trovate ${sameScoreOpponents.length} coppie con stesso punteggio (${currentScore}), scelta quella con ${sameScoreOpponents[0].matches} incontri`);
                return sameScoreOpponents[0].index;
              }
              
              // Altrimenti, prendi la prossima coppia disponibile (con punteggio diverso)
              // Ordina per posizione (più vicina possibile)
              if (otherOpponents.length > 0) {
                otherOpponents.sort((a, b) => a.index - b.index);
                console.log(`   🔍 Nessuna coppia con stesso punteggio, scelta prossima disponibile (posizione ${otherOpponents[0].index + 1})`);
                return otherOpponents[0].index;
              }
              
              return -1; // Nessun avversario disponibile
            }
            
            // Crea partite accoppiando in sequenza (1° vs 2°, 3° vs 4°, ecc.)
            // Ma considera permutazioni quando ci sono pareggi
            const dayMatches: { teamA: LightPlayer[], teamB: LightPlayer[] }[] = [];
            const usedPairs = new Set<number>();
            
            let i = 0;
            while (i < pairsWithScores.length && dayMatches.length < 4) {
              // Salta se questa coppia è già stata usata
              if (usedPairs.has(i)) {
                i++;
                continue;
              }
              
              const pair1 = pairsWithScores[i].pair;
              
              // Trova il miglior avversario per pair1
              const bestOpponentIndex = findBestOpponent(i, i + 1, usedPairs);
              
              if (bestOpponentIndex === -1) {
                console.warn(`⚠️ Nessun avversario disponibile per la coppia ${i + 1}`);
                break;
              }
              
              const pair2 = pairsWithScores[bestOpponentIndex].pair;
              const opponentMatches = countOpponentMatches(pair1, pair2);
              
              // Log se abbiamo fatto una permutazione
              if (bestOpponentIndex !== i + 1) {
                console.log(`   🔄 Permutazione: posizione ${i + 1} vs ${bestOpponentIndex + 1} (invece di ${i + 1} vs ${i + 2}) - Incontri: ${opponentMatches}`);
              }
              
              dayMatches.push({
                teamA: pair1,
                teamB: pair2
              });
              
              usedPairs.add(i);
              usedPairs.add(bestOpponentIndex);
              
              console.log(`   ✅ Partita: ${pair1[0].name} + ${pair1[1].name} (${pairsWithScores[i].totalScore}) vs ${pair2[0].name} + ${pair2[1].name} (${pairsWithScores[bestOpponentIndex].totalScore}) - Incontri: ${opponentMatches}`);
              
              // Avanza alla prossima coppia non usata
              i++;
              while (i < pairsWithScores.length && usedPairs.has(i)) {
                i++;
              }
            }
            
            if (dayMatches.length === 4) {
              console.log(`✅ ${dayMatches.length} partite create dalle coppie predefinite`);
              
              // Converti in MatchCandidate per compatibilità con il resto del codice
              intelligentMatches = dayMatches.map(match => {
                const scoreA = (playerScores.get(match.teamA[0].id || "") || 0) + 
                               (playerScores.get(match.teamA[1].id || "") || 0);
                const scoreB = (playerScores.get(match.teamB[0].id || "") || 0) + 
                               (playerScores.get(match.teamB[1].id || "") || 0);
                const scoreDiff = Math.abs(scoreA - scoreB);
                let opponentRepeatPenalty = 0;
                for (const playerA of match.teamA) {
                  for (const playerB of match.teamB) {
                    const opponentKey = pairKey(playerA.id || "", playerB.id || "");
                    if (opponentPairs.has(opponentKey)) {
                      opponentRepeatPenalty += 50;
                    }
                  }
                }
                return {
                  teamA: match.teamA,
                  teamB: match.teamB,
                  weight: (scoreDiff * 100) + opponentRepeatPenalty,
                  scoreA,
                  scoreB
                };
              });
              console.log(`✅ Partite ottimizzate: ${intelligentMatches.length}`);
            } else {
              console.warn(`⚠️ Solo ${dayMatches.length} partite create invece di 4`);
            }
          } else {
            console.warn(`⚠️ Solo ${pairsAsLightPlayers.length} coppie valide invece di 4+`);
          }
        } else {
          console.warn(`⚠️ Calendario ha solo ${predefinedPairs.length} coppie invece di 4+`);
        }
      } else {
        console.warn(`⚠️ Giornata ${nextMatchday} non trovata nel calendario (indice ${dayIndex})`);
      }
    } else {
      console.warn("⚠️ Calendario predefinito non trovato nel database");
    }
  } catch (error: any) {
    console.error("❌ Errore lettura calendario:", error.message);
  }
  
  // Fallback: Se il calendario predefinito non funziona, usa algoritmo intelligente tradizionale
  if (intelligentMatches.length === 0) {
    console.log("🔄 Fallback: Usando algoritmo intelligente tradizionale (senza calendario predefinito)");
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
    // Calcola la differenza game (DG) per ogni giocatore dalla classifica
    const getGameDiff = (playerId: string) => {
      const standing = standings.find(s => s.playerId === playerId);
      if (standing) {
        return (standing.gamesWon || 0) - (standing.gamesLost || 0);
      }
      return 0;
    };
    
    const teamAPlayer1GameDiff = getGameDiff(match.teamA[0].id || "");
    const teamAPlayer2GameDiff = getGameDiff(match.teamA[1].id || "");
    const teamBPlayer1GameDiff = getGameDiff(match.teamB[0].id || "");
    const teamBPlayer2GameDiff = getGameDiff(match.teamB[1].id || "");
    
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
      // Salva i punteggi e differenza game al momento della generazione (non vengono più aggiornati)
      generationPoints: {
        teamA: {
          player1: { 
            id: match.teamA[0].id, 
            name: match.teamA[0].name, 
            points: match.teamA[0].points || 0,
            gameDiff: teamAPlayer1GameDiff
          },
          player2: { 
            id: match.teamA[1].id, 
            name: match.teamA[1].name, 
            points: match.teamA[1].points || 0,
            gameDiff: teamAPlayer2GameDiff
          },
          total: (match.teamA[0].points || 0) + (match.teamA[1].points || 0)
        },
        teamB: {
          player1: { 
            id: match.teamB[0].id, 
            name: match.teamB[0].name, 
            points: match.teamB[0].points || 0,
            gameDiff: teamBPlayer1GameDiff
          },
          player2: { 
            id: match.teamB[1].id, 
            name: match.teamB[1].name, 
            points: match.teamB[1].points || 0,
            gameDiff: teamBPlayer2GameDiff
          },
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
