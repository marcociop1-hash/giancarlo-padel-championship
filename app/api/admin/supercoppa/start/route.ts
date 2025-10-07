// app/api/admin/genera-nuova-partita/route.ts
import { NextResponse } from "next/server";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { db } from "../../../../../lib/firebase";
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
 *  FASE 1 (Campionato): genera 1 nuova partita
 *  - sceglie 4 con meno partite già giocate in F1
 *  - evita ripetere coppie compagne se possibile
 *  - bilancia team (alto+basso)
 *  Ritorna: {created: 1} se creata, {created: 0} se non possibile
 *  ========================= */
async function generateCampionatoMatch(db: FirebaseFirestore.Firestore) {
  const playersSnap = await db.collection("players").get();
  const players = playersSnap.docs.map((d) => toLight({ id: d.id, ...(d.data() as any) }));
  if (players.length < 4) {
    return { created: 0, reason: "not-enough-players" };
  }

  // storico campionato
  const matchesSnap = await db.collection("matches").where("phase", "==", "campionato").get();
  const matches = matchesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

  const playedCount = new Map<string, number>();
  const teammatePairs = new Set<string>();
  const existingQuartets = new Set<string>();
  for (const p of players) playedCount.set(p.id || "", 0);

  for (const m of matches) {
    const a: LightPlayer[] = (m.teamA || []).map(toLight);
    const b: LightPlayer[] = (m.teamB || []).map(toLight);
    const ids = [...a, ...b].map((x) => x.id || "").filter(Boolean);
    if (ids.length === 4) existingQuartets.add(sameQuartetKey(ids));
    for (const pid of ids) playedCount.set(pid, (playedCount.get(pid) || 0) + 1);
    if (a.length === 2) teammatePairs.add(pairKey(a[0]?.id || "", a[1]?.id || ""));
    if (b.length === 2) teammatePairs.add(pairKey(b[0]?.id || "", b[1]?.id || ""));
  }

  const sorted = players.slice().sort((p1, p2) => {
    const c = (playedCount.get(p1.id || "") || 0) - (playedCount.get(p2.id || "") || 0);
    if (c !== 0) return c;
    return p1.name.localeCompare(p2.name);
  });

  let chosen: LightPlayer[] | null = null;
  outer: for (let i = 0; i < sorted.length - 3; i++) {
    for (let j = i + 1; j < sorted.length - 2; j++) {
      for (let k = j + 1; k < sorted.length - 1; k++) {
        for (let h = k + 1; h < sorted.length; h++) {
          const cand = [sorted[i], sorted[j], sorted[k], sorted[h]];
          const ids = cand.map((x) => x.id || "");
          if (existingQuartets.has(sameQuartetKey(ids))) continue;
          const badPair =
            teammatePairs.has(pairKey(ids[0], ids[1])) ||
            teammatePairs.has(pairKey(ids[0], ids[2])) ||
            teammatePairs.has(pairKey(ids[0], ids[3])) ||
            teammatePairs.has(pairKey(ids[1], ids[2])) ||
            teammatePairs.has(pairKey(ids[1], ids[3])) ||
            teammatePairs.has(pairKey(ids[2], ids[3]));
          if (!badPair) {
            chosen = cand;
            break outer;
          }
          if (!chosen) chosen = cand; // fallback
        }
      }
    }
  }

  if (!chosen) return { created: 0, reason: "no-quartet" };

  // bilanciamento per punteggio
  const withScore = chosen
    .map((p) => ({ ...p, _s: getScoreForRanking(p) }))
    .sort((a, b) => b._s - a._s);
  const teamA = [toLight(withScore[0]), toLight(withScore[3])];
  const teamB = [toLight(withScore[1]), toLight(withScore[2])];

  const matchDoc = {
    phase: "campionato",
    status: "confirmed",
    createdAt: Timestamp.now(),
    date: "",
    time: "",
    place: "",
    teamA,
    teamB,
  };
  const ref = await db.collection("matches").add(matchDoc);
  return { created: 1, id: ref.id };
}

/** =========================
 *  CALCOLO CLASSIFICA CAMPIONATO
 *  - somma punti di squadra a ogni giocatore (scoreA/scoreB)
 *  - conteggia vittorie (winnerTeam)
 *  - salva in 'standings_campionato' + config.phase = 'campionato-completato'
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

  // salva standings e stato torneo
  const batch = db.batch();
  const col = db.collection("standings_campionato");
  // svuota standings esistenti
  const old = await col.get();
  old.forEach((d) => batch.delete(d.ref));

  items.forEach((it, idx) => {
    if (!it.playerId) return; // skip items without id
    const ref = col.doc(it.playerId);
    batch.set(ref, { ...it, rank: idx + 1, frozenAt: Timestamp.now() });
  });

  const cfgRef = db.collection("config").doc("tournament");
  batch.set(cfgRef, { phase: "campionato-completato", completedAt: Timestamp.now() }, { merge: true });

  await batch.commit();

  return { count: items.length };
}

/** =========================
 *  GENERAZIONE SUPERCOPPA PADEL (2vs2) - ALBERO COMPLETO
 *  ========================= */
async function generateSupercoppa(db: FirebaseFirestore.Firestore) {
  // 1. Verifica che il campionato sia completato
  const cfgSnap = await db.collection("config").doc("tournament").get();
  const cfg = cfgSnap.exists ? (cfgSnap.data() as any) : {};
  
  if (cfg?.phase !== "campionato-completato") {
    throw new Error("Il campionato deve essere completato prima di avviare la supercoppa");
  }

  // 2. Carica la classifica congelata del campionato
  const standingsSnap = await db.collection("standings_campionato").get();
  const standings = standingsSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as any)
  }));

  if (standings.length < 16) {
    throw new Error(`Servono almeno 16 giocatori per la supercoppa. Disponibili: ${standings.length}`);
  }

  // 3. Prendi i top 16 giocatori
  const topPlayers = standings
    .sort((a, b) => (a.rank || 0) - (b.rank || 0))
    .slice(0, Math.min(16, standings.length));

  // 4. I giocatori sono già ordinati per classifica (1° al 16°)

  // 5. Genera tutto l'albero della supercoppa
  const batch = db.batch();
  const matches: any[] = [];

  // QUARTI DI FINALE (4 partite) - 4 giocatori per partita
  for (let i = 0; i < 4; i++) {
    const startIdx = i * 4;
    const players = topPlayers.slice(startIdx, startIdx + 4);
    
    const matchDoc = {
      phase: "supercoppa",
      round: 1,
      roundLabel: "Quarti di finale",
      matchNumber: i + 1,
      status: "scheduled",
      createdAt: Timestamp.now(),
      teamA: [toLight(players[0]), toLight(players[1])],
      teamB: [toLight(players[2]), toLight(players[3])],
      winnerAdvancesTo: `semi_${i + 1}`,
    };

    const matchRef = db.collection("matches").doc();
    batch.set(matchRef, matchDoc);
    matches.push({ id: matchRef.id, ...matchDoc });
  }

  // SEMIFINALI (2 partite) - Placeholder
  for (let i = 1; i <= 2; i++) {
    const semiDoc = {
      phase: "supercoppa",
      round: 2,
      roundLabel: "Semifinali",
      matchNumber: i,
      status: "placeholder",
      createdAt: Timestamp.now(),
      teamA: [{ id: null, name: "?" }],
      teamB: [{ id: null, name: "?" }],
      winnerAdvancesTo: "final_1",
      isPlaceholder: true,
    };

    const semiRef = db.collection("matches").doc();
    batch.set(semiRef, semiDoc);
    matches.push({ id: semiRef.id, ...semiDoc });
  }

  // FINALE (1 partita) - Placeholder
  const finalDoc = {
    phase: "supercoppa",
    round: 3,
    roundLabel: "Finale",
    matchNumber: 1,
    status: "placeholder",
    createdAt: Timestamp.now(),
    teamA: [{ id: null, name: "?" }],
    teamB: [{ id: null, name: "?" }],
    winnerAdvancesTo: null,
    isPlaceholder: true,
  };

  const finalRef = db.collection("matches").doc();
  batch.set(finalRef, finalDoc);
  matches.push({ id: finalRef.id, ...finalDoc });

  // 6. Aggiorna lo stato del torneo
  batch.set(
    db.collection("config").doc("tournament"),
    { 
      phase: "supercoppa",
      supercoppaStartedAt: Timestamp.now(),
      totalMatches: matches.length
    },
    { merge: true }
  );

  await batch.commit();

           return {
           created: matches.length,
           players: topPlayers.length,
           matches: matches,
           breakdown: {
             quarti: 4,
             semifinali: 2,
             finale: 1
           }
         };
}

/** =========================
 *  HANDLERS
 *  ========================= */
export async function GET() {
  const db = initAdmin();
  
  try {
    const cfgSnap = await db.collection("config").doc("tournament").get();
    const cfg = cfgSnap.exists ? (cfgSnap.data() as any) : {};
    
    return NextResponse.json({
      ok: true,
      route: "/api/admin/supercoppa/start",
      currentPhase: cfg?.phase || "campionato",
      canStart: cfg?.phase === "campionato-completato",
      usage: {
        POST: "Avvia la supercoppa creando l'albero completo: 4 quarti (4 giocatori per partita) + 2 semifinali + 1 finale.",
      },
    });
  } catch (error: any) {
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}

export async function POST() {
  try {
    const db = initAdmin();
    const result = await generateSupercoppa(db);

    return NextResponse.json({
      ok: true,
      message: `Supercoppa avviata con successo! Create ${result.created} partite (4 quarti + 2 semifinali + 1 finale).`,
      created: result.created,
      players: result.players,
      phase: "supercoppa",
      breakdown: result.breakdown
    });
  } catch (error: any) {
    console.error("ERRORE /api/admin/supercoppa/start:", error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}
