"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { db, auth } from "../../lib/firebase";
import {
  collection,
  getDocs,
  query,
  limit,
  writeBatch,
  doc,
  setDoc,
  where,
  getDoc,
} from "firebase/firestore";
import { isCampionatoComplete, canStartSupercoppa } from '../lib/tournament-phases';

/* =========================
   UTIL: cancellazione generica (client)
   ========================= */
const BATCH_SIZE = 250;

async function deleteBatchFromCollection(colName) {
  const qy = query(collection(db, colName), limit(BATCH_SIZE));
  const snap = await getDocs(qy);
  if (snap.empty) return 0;

  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(doc(db, colName, d.id)));
  await batch.commit();
  return snap.docs.length;
}

async function deleteAllFromCollection(colName, onProgress) {
  let totalDeleted = 0;
  let last = 0;
  do {
    try {
      const qy = query(collection(db, colName), limit(BATCH_SIZE));
      const snap = await getDocs(qy);
      last = snap.docs.length;
      if (last === 0) break;

      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(doc(db, colName, d.id)));
      await batch.commit();

      totalDeleted += last;
      if (onProgress) {
        onProgress({
          running: true,
          deleted: totalDeleted,
          lastBatch: last,
          error: null,
        });
      }
      if (last > 0) await new Promise((r) => setTimeout(r, 120));
    } catch (e) {
      if (onProgress) {
        onProgress({
          running: false,
          deleted: totalDeleted,
          lastBatch: 0,
          error:
            (e && (e.message || String(e))) ||
            "Errore sconosciuto durante l'eliminazione.",
        });
      }
      throw e;
    }
  } while (last > 0);

  if (onProgress) {
    onProgress({
      running: false,
      deleted: totalDeleted,
      lastBatch: 0,
      error: null,
    });
  }
  return totalDeleted;
}

/* ============ Helpers squadra (label) ============ */
function normalizeTeam(team) {
  if (!team) return { a: { id: null, name: "??" }, b: { id: null, name: "??" } };
  const toPlayer = (x) => {
    if (!x) return { id: null, name: "??" };
    if (typeof x === "string") return { id: x, name: x };
    return {
      id: x.id || x.uid || null,
      name: x.name || x.Nome || x.displayName || x.id || "??",
    };
  };
  if (Array.isArray(team)) return { a: toPlayer(team[0]), b: toPlayer(team[1]) };
  if (team.player1 || team.player2)
    return { a: toPlayer(team.player1), b: toPlayer(team.player2) };
  if (team.A || team.B) return { a: toPlayer(team.A), b: toPlayer(team.B) };
  const vals = Object.values(team);
  if (vals.length >= 2) return { a: toPlayer(vals[0]), b: toPlayer(vals[1]) };
  return { a: { id: null, name: "??" }, b: { id: null, name: "??" } };
}
function teamLabel(team) {
  const t = normalizeTeam(team);
  return `${t.a.name} & ${t.b.name}`;
}

/* ============ PAGINA ADMIN ============ */
export default function AdminPage() {
  // Delete collections (client side — opzionali, mantengo)
  const [playersProg, setPlayersProg] = useState({
    running: false,
    deleted: 0,
    lastBatch: 0,
    error: null,
  });
  const [confirmPlayers, setConfirmPlayers] = useState(false);

  const [matchesProg, setMatchesProg] = useState({
    running: false,
    deleted: 0,
    lastBatch: 0,
    error: null,
  });
  const [confirmMatches, setConfirmMatches] = useState(false);

  // Matches confirmed for results
  const [confirmedMatches, setConfirmedMatches] = useState([]);
  const [loadingConfirmed, setLoadingConfirmed] = useState(true);
  const [listMsg, setListMsg] = useState("");

  // Matches scheduled for admin management
  const [scheduledMatches, setScheduledMatches] = useState([]);
  const [loadingScheduled, setLoadingScheduled] = useState(true);

  // Generazione partita
  const [genState, setGenState] = useState("idle"); // "idle" | "loading" | "success" | "error"
  const [genMsg, setGenMsg] = useState("");
  const genEndpointUsed = "/api/admin/genera-giornata";

  // Debug: Generazione partite + risultati
  const [debugGenState, setDebugGenState] = useState("idle"); // "idle" | "loading" | "success" | "error"
  const [debugGenMsg, setDebugGenMsg] = useState("");

  // Reset torneo (server API)
  const [resetState, setResetState] = useState("idle"); // "idle" | "loading" | "success" | "error"
  const [resetMsg, setResetMsg] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [wipeMatches, setWipeMatches] = useState(true); // di default reset totale

  const [starting, setStarting] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [advancing, setAdvancing] = useState(false);
  const [advanceMsg, setAdvanceMsg] = useState(null);
  const [advanceErr, setAdvanceErr] = useState(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [cleaningStatus, setCleaningStatus] = useState(false);
  const [statusInfo, setStatusInfo] = useState(null);

  const [phase, setPhase] = useState(null);
  const [players, setPlayers] = useState([]);
  const [supercoppaMatches, setSupercoppaMatches] = useState([]);
  const [recoveryMatches, setRecoveryMatches] = useState([]);
  const [frozenMatchdays, setFrozenMatchdays] = useState([]);
  const [freezingMatchday, setFreezingMatchday] = useState(false);
  const [freezeMsg, setFreezeMsg] = useState("");
  const [freezeErr, setFreezeErr] = useState("");

  const fetchPlayers = useCallback(async () => {
    try {
      const playersSnap = await getDocs(collection(db, "players"));
      setPlayers(playersSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })));
    } catch (e) {
      console.error("Errore caricamento giocatori:", e);
    }
  }, []);

  const fetchConfirmed = useCallback(async () => {
    setLoadingConfirmed(true);
    try {
      const qy = query(collection(db, "matches"), where("status", "==", "confirmed"));
      const snap = await getDocs(qy);
      setConfirmedMatches(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })));
    } catch (e) {
      console.error(e);
      setMsg((e && (e.message || String(e))) || "Errore caricando partite Confermate.");
    } finally {
      setLoadingConfirmed(false);
    }
  }, []);

  const fetchScheduled = useCallback(async () => {
    setLoadingScheduled(true);
    try {
      const qy = query(collection(db, "matches"), where("status", "==", "scheduled"));
      const snap = await getDocs(qy);
      setScheduledMatches(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })));
    } catch (e) {
      console.error(e);
      setMsg((e && (e.message || String(e))) || "Errore caricando partite Programmate.");
    } finally {
      setLoadingScheduled(false);
    }
  }, []);

  const fetchSupercoppaMatches = useCallback(async () => {
    try {
      const qy = query(collection(db, "matches"), where("phase", "==", "supercoppa"));
      const snap = await getDocs(qy);
      setSupercoppaMatches(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })));
    } catch (e) {
      console.error("Errore caricamento partite supercoppa:", e);
    }
  }, []);

  const fetchRecoveryMatches = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/recovery-matches');
      const data = await response.json();
      if (data.recoveryMatches) {
        setRecoveryMatches(data.recoveryMatches);
      }
    } catch (e) {
      console.error("Errore caricamento partite da recuperare:", e);
    }
  }, []);

  const fetchFrozenMatchdays = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/freeze-matchday');
      const data = await response.json();
      if (data.frozenMatchdays) {
        setFrozenMatchdays(data.frozenMatchdays);
      }
    } catch (e) {
      console.error("Errore caricamento giornate congelate:", e);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch('/api/admin/check-status');
        const data = await response.json();
        if (data.ok && data.status?.tournament?.phase) {
          const currentPhase = data.status.tournament.phase;
          console.log("Fase corrente:", currentPhase);
          setPhase(currentPhase);
        } else {
          console.log("Fase non trovata, default: campionato");
          setPhase("campionato");
        }
      } catch (error) {
        console.error("Errore caricamento fase:", error);
        setPhase("campionato");
      }
    })();
  }, []);

  useEffect(() => {
    fetchConfirmed();
    fetchScheduled();
    fetchPlayers();
    fetchSupercoppaMatches();
    fetchRecoveryMatches();
    fetchFrozenMatchdays();
  }, [fetchConfirmed, fetchScheduled, fetchPlayers, fetchSupercoppaMatches, fetchRecoveryMatches, fetchFrozenMatchdays]);

  // Dropdown risultati ammessi
  const allowed = ["3-0", "2-1", "1-2", "0-3"];
  const [scores, setScores] = useState({}); // { [matchId]: "3-0" | ... }
  
  // Stati per i game dei 3 set
  const [set1Games, setSet1Games] = useState({}); // { [matchId]: { teamA: 6, teamB: 4 } }
  const [set2Games, setSet2Games] = useState({});
  const [set3Games, setSet3Games] = useState({});
  
  // Stati per i messaggi di errore dei set
  const [setErrors, setSetErrors] = useState({}); // { [matchId]: { set1: "messaggio", set2: "messaggio", set3: "messaggio" } }
  const setScore = (id, v) => setScores((s) => ({ ...s, [id]: v }));

  // Stati per i form delle partite scheduled
  const [scheduledFormData, setScheduledFormData] = useState({}); // { [matchId]: { place: "", date: "", time: "" } }
  const [scheduledSaving, setScheduledSaving] = useState({}); // { [matchId]: true/false }
  
  // Funzioni per gestire i game dei set (0-7) con validazione regole padel
  const setSet1Game = (id, team, value) => {
    const validatedValue = validateGameValue(value);
    setSet1Games(prev => {
      const newSet1Games = {
        ...prev,
        [id]: { ...prev[id], [team]: validatedValue }
      };
      
      // Valida le regole del padel per questo set
      const gameA = newSet1Games[id]?.teamA;
      const gameB = newSet1Games[id]?.teamB;
      const validation = validateSetRules(gameA, gameB);
      
      setSetErrors(prevErrors => ({
        ...prevErrors,
        [id]: { ...prevErrors[id], set1: validation.message }
      }));
      
      return newSet1Games;
    });
  };
  
  const setSet2Game = (id, team, value) => {
    const validatedValue = validateGameValue(value);
    setSet2Games(prev => {
      const newSet2Games = {
        ...prev,
        [id]: { ...prev[id], [team]: validatedValue }
      };
      
      // Valida le regole del padel per questo set
      const gameA = newSet2Games[id]?.teamA;
      const gameB = newSet2Games[id]?.teamB;
      const validation = validateSetRules(gameA, gameB);
      
      setSetErrors(prevErrors => ({
        ...prevErrors,
        [id]: { ...prevErrors[id], set2: validation.message }
      }));
      
      return newSet2Games;
    });
  };
  
  const setSet3Game = (id, team, value) => {
    const validatedValue = validateGameValue(value);
    setSet3Games(prev => {
      const newSet3Games = {
        ...prev,
        [id]: { ...prev[id], [team]: validatedValue }
      };
      
      // Valida le regole del padel per questo set
      const gameA = newSet3Games[id]?.teamA;
      const gameB = newSet3Games[id]?.teamB;
      const validation = validateSetRules(gameA, gameB);
      
      setSetErrors(prevErrors => ({
        ...prevErrors,
        [id]: { ...prevErrors[id], set3: validation.message }
      }));
      
      return newSet3Games;
    });
  };

  // Funzione per validare i game (0-7)
  const validateGameValue = (value) => {
    if (value === "") return "";
    const num = parseInt(value);
    if (isNaN(num)) return "";
    // Limita tra 0 e 7
    if (num < 0) return 0;
    if (num > 7) return 7;
    return num;
  };

  // Funzione per validare le regole del padel per un set
  const validateSetRules = (gameA, gameB) => {
    // Se uno dei due è vuoto, non validare ancora
    if (gameA === "" || gameB === "" || gameA === undefined || gameB === undefined) {
      return { valid: true, message: "" };
    }

    const a = parseInt(gameA);
    const b = parseInt(gameB);

    // Regola 1: Nessun 6-6
    if (a === 6 && b === 6) {
      return { valid: false, message: "Impossibile 6-6. Usa il tie-break (7-6)" };
    }

    // Regola 2: Una squadra deve aver vinto almeno 6 game
    if (a < 6 && b < 6) {
      return { valid: false, message: "Una squadra deve aver vinto almeno 6 game" };
    }

    // Regola 3: Se una squadra ha 6 game, l'altra deve averne meno di 6 (massimo 5)
    if (a === 6 && b >= 6) {
      return { valid: false, message: "Se una squadra ha 6 game, l'altra deve averne meno di 6 (massimo 5)" };
    }
    if (b === 6 && a >= 6) {
      return { valid: false, message: "Se una squadra ha 6 game, l'altra deve averne meno di 6 (massimo 5)" };
    }

    // Regola 4: Se una squadra ha 7 game, l'altra deve averne 5 o 6 (tie-break)
    if (a === 7 && b !== 5 && b !== 6) {
      return { valid: false, message: "Con 7 game, l'altra squadra deve averne 5 o 6" };
    }
    if (b === 7 && a !== 5 && a !== 6) {
      return { valid: false, message: "Con 7 game, l'altra squadra deve averne 5 o 6" };
    }

    return { valid: true, message: "" };
  };

  // Funzioni per gestire i form delle partite scheduled
  const setScheduledFormField = (matchId, field, value) => {
    console.log(`🔧 setScheduledFormField: ${matchId}, ${field}, ${value}`);
    setScheduledFormData(prev => ({
      ...prev,
      [matchId]: { ...prev[matchId], [field]: value }
    }));
  };

  const saveScheduledMatchDetails = async (match) => {
    console.log("🔧 saveScheduledMatchDetails chiamata per match:", match.id);
    const formData = scheduledFormData[match.id] || {};
    const { place, date, time } = formData;

    console.log("📝 Form data:", { place, date, time });

    if (!place || !date || !time) {
      const missing = [];
      if (!place) missing.push("campo");
      if (!date) missing.push("data");
      if (!time) missing.push("ora");
      setMsg(`Inserisci: ${missing.join(", ")} per la partita`);
      return;
    }

    setScheduledSaving(prev => ({ ...prev, [match.id]: true }));

    try {
      // Ottieni il token di autenticazione
      const user = auth.currentUser;
      console.log("👤 User:", user ? user.email : "null");
      
      if (!user) {
        throw new Error("Utente non autenticato");
      }
      
      const token = await user.getIdToken();
      console.log("🔑 Token ottenuto:", token ? "sì" : "no");

      console.log("📡 Invio richiesta API...");
      const response = await fetch('/api/matches/update-details', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          matchId: match.id,
          place,
          date,
          time
        })
      });

      console.log("📡 Risposta ricevuta:", response.status, response.statusText);
      const data = await response.json();
      console.log("📡 Data risposta:", data);

      if (response.ok) {
        setMsg(data.message || "Dettagli partita aggiornati con successo");
        // Ricarica sia le partite scheduled che quelle confirmed
        fetchScheduled();
        fetchConfirmed();
        // Pulisci il form
        setScheduledFormData(prev => {
          const newData = { ...prev };
          delete newData[match.id];
          return newData;
        });
      } else {
        setMsg(`Errore: ${data.error}`);
      }
    } catch (error) {
      setMsg(`Errore: ${error.message}`);
    } finally {
      setScheduledSaving(prev => ({ ...prev, [match.id]: false }));
    }
  };
  
  // Funzione per generare game randomi per un set secondo le regole del padel
  const generateRandomSetGames = (teamAWins, teamBWins) => {
    if (teamAWins && teamBWins) {
      // Set vinto da entrambe le squadre (impossibile, ma gestiamo)
      return { teamA: 6, teamB: 4 };
    } else if (teamAWins) {
      // Set vinto dalla squadra A
      // Possibili risultati: 6-0, 6-1, 6-2, 6-3, 6-4, 7-5
      const possibleResults = [
        { teamA: 6, teamB: 0 },
        { teamA: 6, teamB: 1 },
        { teamA: 6, teamB: 2 },
        { teamA: 6, teamB: 3 },
        { teamA: 6, teamB: 4 },
        { teamA: 7, teamB: 5 }
      ];
      
      const randomResult = possibleResults[Math.floor(Math.random() * possibleResults.length)];
      return randomResult;
    } else if (teamBWins) {
      // Set vinto dalla squadra B
      // Possibili risultati: 0-6, 1-6, 2-6, 3-6, 4-6, 5-7
      const possibleResults = [
        { teamA: 0, teamB: 6 },
        { teamA: 1, teamB: 6 },
        { teamA: 2, teamB: 6 },
        { teamA: 3, teamB: 6 },
        { teamA: 4, teamB: 6 },
        { teamA: 5, teamB: 7 }
      ];
      
      const randomResult = possibleResults[Math.floor(Math.random() * possibleResults.length)];
      return randomResult;
    } else {
      // Set non giocato (non dovrebbe succedere)
      return { teamA: 0, teamB: 0 };
    }
  };

  // Determina se la supercoppa è completata e i vincitori
  const supercoppaCompleted = useMemo(() => {
    if (supercoppaMatches.length === 0) return { isCompleted: false, winners: [] };
    
    const completed = supercoppaMatches.filter(m => m.status === "completed").length;
    const isCompleted = completed === supercoppaMatches.length;
    
    // Trova i vincitori (partite finali completate)
    const maxRound = Math.max(...supercoppaMatches.map(m => m.round || 0));
    const finalMatches = supercoppaMatches.filter(m => 
      m.round === maxRound && 
      m.status === "completed" && 
      m.winnerTeam
    );
    
    return { isCompleted, winners: finalMatches };
  }, [supercoppaMatches]);

  const freezeMatchday = async (matchday) => {
    setFreezingMatchday(true);
    setFreezeMsg("");
    setFreezeErr("");
    
    try {
      const response = await fetch('/api/admin/freeze-matchday', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchday })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setFreezeMsg(data.message);
        // Ricarica i dati
        fetchRecoveryMatches();
        fetchFrozenMatchdays();
        fetchConfirmed();
      } else {
        setFreezeErr(data.error || 'Errore durante il congelamento');
      }
    } catch (error) {
      setFreezeErr('Errore di connessione');
      console.error('Errore congelamento giornata:', error);
    } finally {
      setFreezingMatchday(false);
    }
  };

  const completeRecoveryMatch = async (matchId, scoreA, scoreB, winner, notes) => {
    try {
      const response = await fetch('/api/admin/recovery-matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId, scoreA, scoreB, winner, notes })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Ricarica i dati
        fetchRecoveryMatches();
        fetchConfirmed();
        setMsg('Partita da recuperare completata con successo');
      } else {
        setErr(data.error || 'Errore durante il completamento');
      }
    } catch (error) {
      setErr('Errore di connessione');
      console.error('Errore completamento partita da recuperare:', error);
    }
  };

  const saveResult = async (m) => {
    const sel = scores[m.id] || "";
    if (!allowed.includes(sel)) {
      return setMsg("Seleziona un risultato valido (3-0, 2-1, 1-2, 0-3).");
    }
    
    // Validazione game dei set
    const set1 = set1Games[m.id] || {};
    const set2 = set2Games[m.id] || {};
    const set3 = set3Games[m.id] || {};
    
    if (set1.teamA === undefined || set1.teamA === "" || 
        set1.teamB === undefined || set1.teamB === "" ||
        set2.teamA === undefined || set2.teamA === "" || 
        set2.teamB === undefined || set2.teamB === "" ||
        set3.teamA === undefined || set3.teamA === "" || 
        set3.teamB === undefined || set3.teamB === "") {
      return setMsg("Inserisci i game per tutti e 3 i set.");
    }
    
    const [aS, bS] = sel.split("-").map((x) => Number(x));
    const winnerTeam = aS > bS ? "A" : "B";
    
    // Calcola game totali
    const totalGamesA = (set1.teamA ?? 0) + (set2.teamA ?? 0) + (set3.teamA ?? 0);
    const totalGamesB = (set1.teamB ?? 0) + (set2.teamB ?? 0) + (set3.teamB ?? 0);
    
    try {
      await setDoc(
        doc(db, "matches", m.id),
        {
          scoreA: aS,
          scoreB: bS,
          winnerTeam,
          status: "completed",
          completedAt: Date.now(),
          // Game per set
          set1Games: set1,
          set2Games: set2,
          set3Games: set3,
          // Game totali
          totalGamesA,
          totalGamesB,
        },
        { merge: true }
      );
      setMsg("Risultato salvato con dettagli game. La partita passa in stato Giocata. La classifica si aggiorna automaticamente.");
      setConfirmedMatches((prev) => prev.filter((x) => x.id !== m.id));
      
      // Pulisci i form
      setScores(prev => ({ ...prev, [m.id]: "" }));
      setSet1Games(prev => ({ ...prev, [m.id]: {} }));
      setSet2Games(prev => ({ ...prev, [m.id]: {} }));
      setSet3Games(prev => ({ ...prev, [m.id]: {} }));
      setSetErrors(prev => ({ ...prev, [m.id]: {} }));
      
      // Ricarica le partite confermate per aggiornare la lista
      fetchConfirmed();
      
      // Invalida la cache della classifica per forzare il ricalcolo
      try {
        await fetch('/api/classifica?refresh=true');
      } catch (e) {
        console.log('Errore invalidation cache classifica:', e);
      }
    } catch (e) {
      console.error(e);
      setMsg((e && (e.message || String(e))) || "Errore salvataggio risultato.");
    }
  };

  const handleGenerateMatch = useCallback(async () => {
    setGenState("loading");
    setGenMsg("");
    try {
      const res = await fetch(genEndpointUsed, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setGenState("success");
        setGenMsg((data?.message || "OK.") + " (nuove partite in stato: In programma)");
        fetchConfirmed();
        fetchScheduled();
      } else {
        setGenState("error");
        setGenMsg((data && (data.message || data.error)) || `HTTP ${res.status}`);
      }
    } catch (e) {
      setGenState("error");
      setGenMsg((e && (e.message || String(e))) || "Errore di rete");
    }
  }, [genEndpointUsed, fetchConfirmed]);

  // Debug: Genera partite + risultati randomi
  const handleGenerateWithResults = useCallback(async () => {
    setDebugGenState("loading");
    setDebugGenMsg("");
    try {
      // 1. Genera le partite
      const res = await fetch(genEndpointUsed, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      
      if (!res.ok) {
        setDebugGenState("error");
        setDebugGenMsg((data && (data.message || data.error)) || `HTTP ${res.status}`);
        return;
      }

      // 2. Se le partite sono state create, assegna risultati randomi
      if (data.created > 0) {
        // Carica le partite appena create (dovrebbero essere in stato "scheduled")
        const matchesRes = await fetch('/api/admin/debug-matches');
        const matchesData = await matchesRes.json();
        
        if (matchesData.matches) {
          const scheduledMatches = matchesData.matches.filter(m => m.status === "scheduled");
          let completedCount = 0;
          
          // Assegna risultati randomi a tutte le partite programmate
          for (const match of scheduledMatches) {
            const possibleResults = ["3-0", "2-1", "1-2", "0-3"];
            const randomResult = possibleResults[Math.floor(Math.random() * possibleResults.length)];
            const [scoreA, scoreB] = randomResult.split("-").map(x => parseInt(x));
            const winnerTeam = scoreA > scoreB ? "A" : "B";
            
            // Genera game randomi per ogni set secondo il risultato
            let set1Games, set2Games, set3Games;
            
            if (scoreA === 3 && scoreB === 0) {
              // 3-0: A vince tutti e 3 i set
              set1Games = generateRandomSetGames(true, false);
              set2Games = generateRandomSetGames(true, false);
              set3Games = generateRandomSetGames(true, false);
            } else if (scoreA === 0 && scoreB === 3) {
              // 0-3: B vince tutti e 3 i set
              set1Games = generateRandomSetGames(false, true);
              set2Games = generateRandomSetGames(false, true);
              set3Games = generateRandomSetGames(false, true);
            } else if (scoreA === 2 && scoreB === 1) {
              // 2-1: A vince set 1 e 2, B vince set 3
              set1Games = generateRandomSetGames(true, false);
              set2Games = generateRandomSetGames(true, false);
              set3Games = generateRandomSetGames(false, true);
            } else if (scoreA === 1 && scoreB === 2) {
              // 1-2: A vince set 1, B vince set 2 e 3
              set1Games = generateRandomSetGames(true, false);
              set2Games = generateRandomSetGames(false, true);
              set3Games = generateRandomSetGames(false, true);
            } else {
              // Fallback (non dovrebbe succedere)
              set1Games = generateRandomSetGames(scoreA >= 1, scoreB >= 1);
              set2Games = generateRandomSetGames(scoreA >= 2, scoreB >= 2);
              set3Games = generateRandomSetGames(scoreA >= 3, scoreB >= 3);
            }
            
            // Calcola game totali
            const totalGamesA = set1Games.teamA + set2Games.teamA + set3Games.teamA;
            const totalGamesB = set1Games.teamB + set2Games.teamB + set3Games.teamB;
            
            try {
              await setDoc(
                doc(db, "matches", match.id),
                {
                  scoreA,
                  scoreB,
                  winnerTeam,
                  status: "completed",
                  completedAt: Date.now(),
                  // Game per set
                  set1Games,
                  set2Games,
                  set3Games,
                  // Game totali
                  totalGamesA,
                  totalGamesB,
                },
                { merge: true }
              );
              completedCount++;
            } catch (e) {
              console.error("Errore aggiornamento partita:", e);
            }
          }
          
          setDebugGenState("success");
          setDebugGenMsg(`✅ Generati ${data.created} partite e completati ${completedCount} con risultati randomi!`);
          
          // Ricarica i dati
          fetchConfirmed();
          fetchScheduled();
          
          // Invalida la cache della classifica
          try {
            await fetch('/api/classifica?refresh=true');
          } catch (e) {
            console.log('Errore invalidation cache classifica:', e);
          }
        } else {
          setDebugGenState("success");
          setDebugGenMsg(`✅ Generati ${data.created} partite, ma nessuna partita programmata trovata per i risultati`);
        }
      } else {
        setDebugGenState("success");
        setDebugGenMsg("✅ Nessuna partita generata (campionato completato o altri motivi)");
      }
    } catch (e) {
      setDebugGenState("error");
      setDebugGenMsg((e && (e.message || String(e))) || "Errore di rete");
    }
  }, [genEndpointUsed, fetchConfirmed]);

  const handleDeletePlayers = useCallback(async () => {
    if (!confirmPlayers) {
      setConfirmPlayers(true);
      alert("ATTENZIONE: elimina TUTTI i GIOCATORI. Clicca di nuovo per confermare.");
      return;
    }
    setPlayersProg({ running: true, deleted: 0, lastBatch: 0, error: null });
    try {
      await deleteAllFromCollection("players", (p) => setPlayersProg(p));
    } finally {
      setConfirmPlayers(false);
    }
  }, [confirmPlayers]);

  const handleDeleteMatches = useCallback(async () => {
    if (!confirmMatches) {
      setConfirmMatches(true);
      alert("ATTENZIONE: elimina TUTTE le PARTITE. Clicca di nuovo per confermare.");
      return;
    }
    setMatchesProg({ running: true, deleted: 0, lastBatch: 0, error: null });
    try {
      await deleteAllFromCollection("matches", (p) => setMatchesProg(p));
      fetchConfirmed();
    } finally {
      setConfirmMatches(false);
    }
  }, [confirmMatches, fetchConfirmed]);

  const handleResetTournament = useCallback(async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      alert(
        "Confermi di RIPARTIRE DA ZERO?\n- Sblocca il Campionato\n- Cancella la classifica congelata\n- " +
          (wipeMatches ? "Cancella TUTTE le partite\n" : "NON cancella le partite\n") +
          "Clicca di nuovo per confermare."
      );
      return;
    }
    
    console.log('🔄 RESET TORNEO INIZIATO (CLIENT)');
    console.log('wipeMatches:', wipeMatches);
    
    setResetState("loading");
    setResetMsg("");
    try {
      const url = `/api/admin/reset-campionato${wipeMatches ? "?wipeMatches=true" : ""}`;
      console.log('📡 Chiamando API reset:', url);
      
      const res = await fetch(url, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      
      console.log('📡 Risposta API reset:', { status: res.status, data });
      
      if (res.ok) {
        setResetState("success");
        setResetMsg(data?.message || "Reset completato.");
        console.log('✅ Reset completato con successo');
        
        // ricarica lista "Confermate"
        console.log('🔄 Ricaricando partite confermate...');
        fetchConfirmed();
        
        // Le partite confermate vengono ricaricate tramite fetchConfirmed()
        
        // Forza il refresh della classifica
        console.log('🔄 Forzando refresh classifica...');
        try {
          const classificaRes = await fetch('/api/classifica?refresh=true');
          const classificaData = await classificaRes.json();
          console.log('📊 Classifica dopo reset:', classificaData);
          
          // Controlla se ci sono ancora partite
          if (classificaData.totalMatches > 0) {
            console.log('⚠️ PROBLEMA: Ci sono ancora', classificaData.totalMatches, 'partite dopo il reset!');
          } else {
            console.log('✅ Nessuna partita rimasta dopo il reset');
          }
          
          // Controlla punteggi
          const playersWithPoints = classificaData.rows?.filter(p => p.points > 0) || [];
          if (playersWithPoints.length > 0) {
            console.log('⚠️ PROBLEMA: Giocatori con punteggi > 0:', playersWithPoints.length);
            console.log('🎯 Esempi:', playersWithPoints.slice(0, 3));
          } else {
            console.log('✅ Tutti i giocatori hanno 0 punti');
          }
        } catch (e) {
          console.error('❌ Errore refresh classifica:', e);
        }
      } else {
        setResetState("error");
        setResetMsg((data && (data.message || data.error)) || `HTTP ${res.status}`);
        console.error('❌ Errore reset:', data);
      }
    } catch (e) {
      setResetState("error");
      setResetMsg((e && (e.message || String(e))) || "Errore di rete");
      console.error('❌ Errore rete reset:', e);
    } finally {
      setConfirmReset(false);
    }
  }, [confirmReset, wipeMatches, fetchConfirmed]);

  async function handleStartSupercoppa() {
    if (!confirm("Confermi l'attivazione della Supercoppa?")) return;
    setStarting(true); setMsg(null); setErr(null);
    try {
      const res = await fetch('/api/admin/supercoppa/start', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Errore attivazione');
      setMsg('Supercoppa attivata con successo');
      // facoltativo: ricarica dati o pagina
      // location.reload();
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setStarting(false);
    }
  }

  async function handleAdvanceSupercoppa() {
    if (!confirm("Confermi l'avanzamento automatico dei vincitori?")) return;
    setAdvancing(true); setAdvanceMsg(null); setAdvanceErr(null);
    try {
      const res = await fetch('/api/admin/supercoppa/advance', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Errore avanzamento');
      setAdvanceMsg(`Avanzamento completato. Create ${data.created} nuove partite.`);
      // facoltativo: ricarica dati o pagina
      // location.reload();
    } catch (e) {
      setAdvanceErr(e.message || String(e));
    } finally {
      setAdvancing(false);
    }
  }

  async function handleCheckStatus() {
    setCheckingStatus(true);
    try {
      const res = await fetch('/api/admin/check-status', { method: 'GET' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Errore verifica');
      setStatusInfo(data.status);
    } catch (e) {
      alert('Errore verifica stato: ' + e.message);
    } finally {
      setCheckingStatus(false);
    }
  }

  async function handleCleanStatus() {
    if (!confirm("Confermi la pulizia dello stato? Questo eliminerà le standings e resetterà il torneo.")) return;
    setCleaningStatus(true);
    try {
      const res = await fetch('/api/admin/check-status', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Errore pulizia');
      alert('Stato pulito: ' + data.message);
      setStatusInfo(null);
      // Ricarica le partite confermate
      fetchConfirmed();
    } catch (e) {
      alert('Errore pulizia stato: ' + e.message);
    } finally {
      setCleaningStatus(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Strumenti torneo</h1>
      
      {/* Debug info */}
      <div className="rounded-lg border bg-gray-50 p-3 text-xs text-gray-600">
        <div>Debug Info:</div>
        <div>• Scheduled matches: {scheduledMatches.length}</div>
        <div>• Confirmed matches: {confirmedMatches.length}</div>
        <div>• Loading scheduled: {loadingScheduled ? 'true' : 'false'}</div>
        <div>• Loading confirmed: {loadingConfirmed ? 'true' : 'false'}</div>
      </div>

      {msg && (
        <div className="rounded-md bg-yellow-50 p-3 text-sm text-yellow-800">
          {msg}
        </div>
      )}

      {/* ====== GENERA NUOVA (Campionato) ====== */}
      <section className="rounded-2xl border bg-white p-4 space-y-3">
        <h2 className="text-lg font-medium">Genera nuova giornata (Campionato)</h2>
        <p className="text-sm text-gray-600">
          Crea automaticamente una nuova giornata del Campionato con tutte le partite possibili.
          Le nuove partite nascono <b>In programma</b>. A fine combinazioni, la classifica viene congelata.
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={handleGenerateMatch}
            disabled={genState === "loading"}
            className={`rounded-xl px-4 py-2 text-white ${
              genState === "loading"
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {genState === "loading" ? "Generazione…" : "Genera nuova giornata"}
          </button>
          {genState === "success" && (
            <span className="text-green-700 text-sm">✅ {genMsg}</span>
          )}
          {genState === "error" && (
            <span className="text-red-700 text-sm">❌ {genMsg}</span>
          )}
        </div>
        <div className="text-xs text-gray-500">
          Endpoint: <code>{genEndpointUsed}</code>
        </div>
      </section>

      {/* ====== DEBUG: GENERA PARTITE + RISULTATI ====== */}
      <section className="rounded-2xl border bg-yellow-50 p-4 space-y-3">
        <h2 className="text-lg font-medium text-yellow-800">🚀 Debug: Genera Partite + Risultati</h2>
        <p className="text-sm text-yellow-700">
          <b>ATTENZIONE:</b> Questo pulsante genera partite E assegna risultati randomi automaticamente.
          Utile per testare velocemente l'algoritmo di accoppiamenti. I risultati sono casuali!
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={handleGenerateWithResults}
            disabled={debugGenState === "loading"}
            className={`rounded-xl px-4 py-2 text-white ${
              debugGenState === "loading"
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-yellow-600 hover:bg-yellow-700"
            }`}
          >
            {debugGenState === "loading" ? "Generazione + Risultati…" : "🚀 Genera + Risultati Random"}
          </button>
          {debugGenState === "success" && (
            <span className="text-green-700 text-sm">✅ {debugGenMsg}</span>
          )}
          {debugGenState === "error" && (
            <span className="text-red-700 text-sm">❌ {debugGenMsg}</span>
          )}
        </div>
        <div className="text-xs text-yellow-600">
          ⚠️ <b>Debug Mode:</b> Genera partite e assegna risultati casuali (3-0, 2-1, 1-2, 0-3)
        </div>
      </section>

      {/* ====== INSERISCI RISULTATO (solo menu a tendina) ====== */}
      <section className="rounded-2xl border bg-white p-4 space-y-4">
        <h2 className="text-lg font-medium">Inserisci risultato (Confermate)</h2>
        {loadingConfirmed ? (
          <div className="text-sm text-gray-600">Caricamento…</div>
        ) : confirmedMatches.length === 0 ? (
          <div className="rounded-lg border border-dashed py-6 text-center text-sm text-gray-500">
            Nessuna partita <b>Confermata</b> in attesa di risultato.
          </div>
        ) : (
          <div className="space-y-3">
            {confirmedMatches.map((m) => (
              <div key={m.id} className="rounded-xl border p-3">
                <div className="text-sm text-gray-500">
                  {m.phase
                    ? m.phase === "campionato"
                      ? "Campionato"
                      : m.phase === "supercoppa"
                      ? "SuperCoppa"
                      : String(m.phase)
                    : "—"}{" "}
                  {m.roundLabel ? `• ${m.roundLabel}` : m.round ? `• Round ${m.round}` : ""}{" "}
                  {m.date ? `• ${m.date}` : ""} {m.time ? `• ${m.time}` : ""}{" "}
                  {m.place ? `• ${m.place}` : ""}
                </div>
                <div className="mt-1 font-medium">
                  {teamLabel(m.teamA)} vs {teamLabel(m.teamB)}
                </div>

                <div className="mt-3 space-y-3">
                  {/* Risultato finale */}
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700">Risultato finale:</label>
                    <select
                      className="w-32 rounded-md border px-2 py-1 text-sm"
                      value={scores[m.id] || ""}
                      onChange={(e) => setScore(m.id, e.target.value)}
                    >
                      <option value="">Seleziona risultato</option>
                      {allowed.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  {/* Game per set */}
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-gray-700">Game per set:</div>
                    
                    {/* Set 1 */}
                    <div className="flex items-center gap-2 text-sm">
                      <span className="w-12 text-gray-600">Set 1:</span>
                      <input
                        type="number"
                        min="0"
                        max="7"
                        className="w-16 rounded-md border px-2 py-1 text-center"
                        placeholder="A"
                        value={set1Games[m.id]?.teamA ?? ""}
                        onChange={(e) => setSet1Game(m.id, "teamA", e.target.value)}
                      />
                      <span className="text-gray-500">-</span>
                      <input
                        type="number"
                        min="0"
                        max="7"
                        className="w-16 rounded-md border px-2 py-1 text-center"
                        placeholder="B"
                        value={set1Games[m.id]?.teamB ?? ""}
                        onChange={(e) => setSet1Game(m.id, "teamB", e.target.value)}
                      />
                    </div>
                    {setErrors[m.id]?.set1 && (
                      <div className="text-xs text-red-600 bg-red-50 p-1 rounded">
                        ⚠️ {setErrors[m.id].set1}
                      </div>
                    )}
                    
                    {/* Set 2 */}
                    <div className="flex items-center gap-2 text-sm">
                      <span className="w-12 text-gray-600">Set 2:</span>
                      <input
                        type="number"
                        min="0"
                        max="7"
                        className="w-16 rounded-md border px-2 py-1 text-center"
                        placeholder="A"
                        value={set2Games[m.id]?.teamA ?? ""}
                        onChange={(e) => setSet2Game(m.id, "teamA", e.target.value)}
                      />
                      <span className="text-gray-500">-</span>
                      <input
                        type="number"
                        min="0"
                        max="7"
                        className="w-16 rounded-md border px-2 py-1 text-center"
                        placeholder="B"
                        value={set2Games[m.id]?.teamB ?? ""}
                        onChange={(e) => setSet2Game(m.id, "teamB", e.target.value)}
                      />
                    </div>
                    {setErrors[m.id]?.set2 && (
                      <div className="text-xs text-red-600 bg-red-50 p-1 rounded">
                        ⚠️ {setErrors[m.id].set2}
                      </div>
                    )}
                    
                    {/* Set 3 */}
                    <div className="flex items-center gap-2 text-sm">
                      <span className="w-12 text-gray-600">Set 3:</span>
                      <input
                        type="number"
                        min="0"
                        max="7"
                        className="w-16 rounded-md border px-2 py-1 text-center"
                        placeholder="A"
                        value={set3Games[m.id]?.teamA ?? ""}
                        onChange={(e) => setSet3Game(m.id, "teamA", e.target.value)}
                      />
                      <span className="text-gray-500">-</span>
                      <input
                        type="number"
                        min="0"
                        max="7"
                        className="w-16 rounded-md border px-2 py-1 text-center"
                        placeholder="B"
                        value={set3Games[m.id]?.teamB ?? ""}
                        onChange={(e) => setSet3Game(m.id, "teamB", e.target.value)}
                      />
                    </div>
                    {setErrors[m.id]?.set3 && (
                      <div className="text-xs text-red-600 bg-red-50 p-1 rounded">
                        ⚠️ {setErrors[m.id].set3}
                      </div>
                    )}
                  </div>
                  
                  <button
                    onClick={() => saveResult(m)}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                  >
                    Salva risultato completo
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ====== GESTIONE PARTITE PROGRAMMATE (scheduled) ====== */}
      <section className="rounded-2xl border bg-white p-4 space-y-4">
        <h2 className="text-lg font-medium">Gestione Partite Programmate (Scheduled)</h2>
        <p className="text-sm text-gray-600">
          Inserisci campo, data e ora per le partite in stato "Programmata". Dopo l'aggiornamento, la partita passerà automaticamente in stato "Confermata" e potrai inserire i risultati.
        </p>
        <div className="text-xs text-gray-500 mb-2">
          Debug: {scheduledMatches.length} partite scheduled trovate
        </div>
        {loadingScheduled ? (
          <div className="text-sm text-gray-600">Caricamento…</div>
        ) : scheduledMatches.length === 0 ? (
          <div className="rounded-lg border border-dashed py-6 text-center text-sm text-gray-500">
            Nessuna partita <b>Programmata</b> in attesa di dettagli.
            <br />
            <span className="text-xs text-gray-400 mt-2 block">
              Genera una nuova giornata per creare partite in stato "scheduled"
            </span>
          </div>
        ) : (
          <div className="space-y-3">
            {scheduledMatches.map((m) => (
              <div key={m.id} className="rounded-xl border p-3">
                <div className="text-sm text-gray-500">
                  {m.phase
                    ? m.phase === "campionato"
                      ? "Campionato"
                      : m.phase === "supercoppa"
                      ? "SuperCoppa"
                      : String(m.phase)
                    : "—"}{" "}
                  {m.roundLabel ? `• ${m.roundLabel}` : m.round ? `• Round ${m.round}` : ""}{" "}
                  {m.matchday ? `• Giornata ${m.matchday}` : ""}
                </div>
                <div className="mt-1 font-medium">
                  {teamLabel(m.teamA)} vs {teamLabel(m.teamB)}
                </div>

                <div className="mt-3 space-y-3">
                  <div className="text-sm font-medium text-gray-700">Dettagli partita:</div>
                  
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <input
                      className="rounded-md border px-2 py-1 text-sm"
                      placeholder="Campo"
                      value={scheduledFormData[m.id]?.place || m.place || ""}
                      onChange={(e) => setScheduledFormField(m.id, "place", e.target.value)}
                    />
                    <input
                      className="rounded-md border px-2 py-1 text-sm"
                      type="date"
                      value={scheduledFormData[m.id]?.date || m.date || ""}
                      onChange={(e) => setScheduledFormField(m.id, "date", e.target.value)}
                    />
                    <input
                      className="rounded-md border px-2 py-1 text-sm"
                      type="time"
                      value={scheduledFormData[m.id]?.time || m.time || ""}
                      onChange={(e) => setScheduledFormField(m.id, "time", e.target.value)}
                    />
                  </div>
                  
                  <button
                    onClick={() => saveScheduledMatchDetails(m)}
                    disabled={scheduledSaving[m.id]}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {scheduledSaving[m.id] ? "Salvataggio…" : "Aggiorna dettagli"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ====== RESET TORNEO (server) ====== */}
      <section className="rounded-2xl border bg-white p-4 space-y-3">
        <h2 className="text-lg font-medium">Reset torneo (riparti da zero)</h2>
        <p className="text-sm text-gray-600">
          Sblocca il Campionato e cancella la classifica congelata. Puoi anche cancellare tutte le partite.
        </p>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={wipeMatches}
              onChange={(e) => setWipeMatches(e.target.checked)}
            />
            Cancella anche tutte le partite
          </label>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleResetTournament}
            disabled={resetState === "loading"}
            className={`rounded-xl px-4 py-2 text-white ${
              resetState === "loading"
                ? "bg-gray-400 cursor-not-allowed"
                : confirmReset
                ? "bg-rose-700 hover:bg-rose-800"
                : "bg-rose-600 hover:bg-rose-700"
            }`}
          >
            {resetState === "loading"
              ? "Reset in corso…"
              : confirmReset
              ? "Conferma: RIPARTI DA ZERO"
              : "Riparti da zero"}
          </button>
          {resetState === "success" && (
            <span className="text-green-700 text-sm">✅ {resetMsg}</span>
          )}
          {resetState === "error" && (
            <span className="text-red-700 text-sm">❌ {resetMsg}</span>
          )}
        </div>

        <div className="text-xs text-gray-500">
          Endpoint: <code>/api/admin/reset-campionato</code>
          {wipeMatches ? <span> (con <code>?wipeMatches=true</code>)</span> : null}
        </div>
      </section>

      {/* ====== COLLEGA EMAIL GIOCATORI ====== */}
      <section className="rounded-2xl border bg-white p-4 space-y-3">
        <h2 className="text-lg font-medium">Collega email giocatori</h2>
        <p className="text-sm text-gray-600">
          Associa le email degli utenti ai profili giocatori per permettere la conferma delle partite.
        </p>
        
        <div className="space-y-2">
          {players.map((player) => (
            <div key={player.id} className="flex items-center gap-2 p-2 border rounded">
              <div className="flex-1">
                <div className="font-medium">{player.name}</div>
                <div className="text-xs text-gray-500">
                  {player.email ? `Email: ${player.email}` : "Nessuna email associata"}
                </div>
              </div>
              {!player.email && (
                <button
                  onClick={() => {
                    const email = prompt(`Inserisci l'email per ${player.name}:`);
                    if (email) {
                      fetch("/api/admin/link-player-email", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ playerId: player.id, email })
                      })
                      .then(res => res.json())
                      .then(data => {
                        if (data.ok) {
                          alert("Email associata con successo!");
                          fetchPlayers(); // Ricarica i giocatori invece di ricaricare la pagina
                        } else {
                          alert("Errore: " + data.error);
                        }
                      })
                      .catch(err => alert("Errore: " + err.message));
                    }
                  }}
                  className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Collega email
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ====== GESTIONE PARTITE DA RECUPERARE ====== */}
      <section className="rounded-2xl border bg-white p-4 space-y-3">
        <h2 className="text-lg font-medium">Gestione Partite da Recuperare</h2>
        <p className="text-sm text-gray-600">
          Gestisci le partite che non sono state completate e che sono state segnate come "da recuperare".
        </p>

        {/* Statistiche */}
        <div className="grid grid-cols-2 gap-4 p-3 bg-gray-50 rounded-lg">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{recoveryMatches.length}</div>
            <div className="text-sm text-gray-600">Partite da recuperare</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{frozenMatchdays.length}</div>
            <div className="text-sm text-gray-600">Giornate congelate</div>
          </div>
        </div>

        {/* Congela giornata */}
        <div className="border-t pt-3">
          <h3 className="text-md font-medium mb-2">Congela Giornata</h3>
          <p className="text-sm text-gray-500 mb-3">
            <strong>Importante:</strong> Quando congeli una giornata, <strong>tutte le partite</strong> di quella giornata (anche quelle completate) non influenzano la classifica finché non vengono risolti tutti i recuperi. Questo garantisce la coerenza dei punteggi.
          </p>
          
          <div className="flex items-center gap-3">
            <input
              type="number"
              placeholder="Numero giornata"
              className="px-3 py-2 border rounded-lg"
              id="freezeMatchdayInput"
            />
            <button
              onClick={() => {
                const matchday = parseInt(document.getElementById('freezeMatchdayInput').value);
                if (matchday && matchday > 0) {
                  freezeMatchday(matchday);
                } else {
                  setFreezeErr('Inserisci un numero di giornata valido');
                }
              }}
              disabled={freezingMatchday}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:bg-gray-400"
            >
              {freezingMatchday ? 'Congelamento...' : 'Congela Giornata'}
            </button>
          </div>
          
          {freezeMsg && (
            <div className="text-green-600 text-sm mt-2">✅ {freezeMsg}</div>
          )}
          {freezeErr && (
            <div className="text-red-600 text-sm mt-2">❌ {freezeErr}</div>
          )}
        </div>

        {/* Lista partite da recuperare */}
        {recoveryMatches.length > 0 && (
          <div className="border-t pt-3">
            <h3 className="text-md font-medium mb-2">Partite da Recuperare</h3>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
              <div className="text-sm text-blue-800">
                <strong>Nota:</strong> Finché ci sono partite da recuperare per una giornata, <strong>nessuna partita</strong> di quella giornata (nemmeno quelle completate) influenza la classifica. Questo garantisce che i punteggi rimangano coerenti.
              </div>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {recoveryMatches.map((match) => (
                <div key={match.id} className="p-3 border rounded-lg bg-yellow-50">
                  <div className="flex justify-between items-start mb-2">
                    <div className="text-sm">
                      <div className="font-medium">Giornata {match.matchday || 'N/A'}</div>
                      <div className="text-gray-600">
                        {normalizeTeam(match.teamA).a.name} + {normalizeTeam(match.teamA).b.name} vs {' '}
                        {normalizeTeam(match.teamB).a.name} + {normalizeTeam(match.teamB).b.name}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        const scoreA = prompt('Punteggio Team A:');
                        const scoreB = prompt('Punteggio Team B:');
                        const winner = prompt('Vincitore (A o B):');
                        const notes = prompt('Note (opzionale):');
                        
                        if (scoreA && scoreB && winner) {
                          completeRecoveryMatch(match.id, scoreA, scoreB, winner, notes);
                        }
                      }}
                      className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                    >
                      Completa
                    </button>
                  </div>
                  {match.recoveryNotes && (
                    <div className="text-xs text-gray-500 mt-1">
                      Note: {match.recoveryNotes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ====== VERIFICA STATO ====== */}
      <section className="rounded-2xl border bg-white p-4 space-y-3">
        <h2 className="text-lg font-medium">Verifica e pulisci stato</h2>
        <p className="text-sm text-gray-600">
          Verifica lo stato attuale del torneo e pulisci eventuali inconsistenze. "Pulisci Stato" cancella TUTTE le partite e standings.
        </p>
        
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            onClick={handleCheckStatus}
            disabled={checkingStatus}
            className="rounded-xl px-3 sm:px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 text-sm sm:text-base"
          >
            {checkingStatus ? "Verifica in corso…" : "Verifica Stato"}
          </button>
          <button
            onClick={handleCleanStatus}
            disabled={cleaningStatus}
            className="rounded-xl px-3 sm:px-4 py-2 bg-orange-600 text-white hover:bg-orange-700 text-sm sm:text-base"
          >
            {cleaningStatus ? "Pulizia in corso…" : "Pulisci Stato"}
          </button>
          <button
            onClick={async () => {
              try {
                const response = await fetch('/api/classifica?refresh=true');
                if (response.ok) {
                  alert('Classifica aggiornata con successo! Apri la pagina classifica per vedere i cambiamenti.');
                  // Apri la pagina classifica in una nuova tab
                  window.open('/classifica', '_blank');
                } else {
                  alert('Errore nell\'aggiornamento della classifica');
                }
              } catch (e) {
                alert('Errore: ' + e.message);
              }
            }}
            className="rounded-xl px-3 sm:px-4 py-2 bg-green-600 text-white hover:bg-green-700 text-sm sm:text-base"
          >
            Aggiorna Classifica
          </button>

          <button
            onClick={() => window.open('/classifica', '_blank')}
            className="rounded-xl px-3 sm:px-4 py-2 bg-purple-600 text-white hover:bg-purple-700 text-sm sm:text-base"
          >
            Apri Classifica
          </button>

          <button
            onClick={async () => {
              try {
                const response = await fetch('/api/admin/check-incomplete-matches');
                const data = await response.json();
                if (data.ok) {
                  const summary = data.summary;
                  const message = `Stato Campionato:\n` +
                    `Giocatori: ${summary.totalPlayers}\n` +
                    `Partite completate: ${summary.completedMatches}/${summary.maxTotalMatches}\n` +
                    `Partite incomplete: ${summary.incompleteMatches}\n` +
                    `Partite rimanenti: ${summary.remainingMatches}\n` +
                    `Può generare nuova giornata: ${data.canGenerateNewDay ? 'SÌ' : 'NO'}`;
                  
                  if (summary.incompleteMatches > 0) {
                    alert(message + '\n\n⚠️ Inserisci tutti i risultati prima di generare una nuova giornata!');
                  } else {
                    alert(message);
                  }
                } else {
                  alert('Errore: ' + data.error);
                }
              } catch (e) {
                alert('Errore: ' + e.message);
              }
            }}
            className="rounded-xl px-3 sm:px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 text-sm sm:text-base"
          >
            Verifica Stato Campionato
          </button>
        </div>
        
        {statusInfo && (
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <h4 className="font-medium mb-2">Stato Attuale:</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <strong>Fase:</strong> {statusInfo.tournament.phase}
              </div>
              <div>
                <strong>Giocatori:</strong> {statusInfo.players}
              </div>
              <div>
                <strong>Partite Campionato:</strong> {statusInfo.matches.campionato}
              </div>
              <div>
                <strong>Partite Supercoppa:</strong> {statusInfo.matches.supercoppa}
              </div>
              <div>
                <strong>Partite Completate:</strong> {statusInfo.matches.completed}
              </div>
              <div>
                <strong>Standings:</strong> {statusInfo.standings}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ====== ELIMINA GIOCATORI ====== */}
      <section className="rounded-2xl border bg-white p-4 space-y-2">
        <h2 className="text-lg font-medium">Elimina tutti i giocatori</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={handleDeletePlayers}
            disabled={playersProg.running}
            className={`rounded-xl px-4 py-2 text-white ${
              playersProg.running
                ? "bg-gray-400 cursor-not-allowed"
                : confirmPlayers
                ? "bg-red-600 hover:bg-red-700"
                : "bg-red-500 hover:bg-red-600"
            }`}
          >
            {playersProg.running
              ? "Eliminazione giocatori…"
              : confirmPlayers
              ? "Conferma: elimina TUTTI"
              : "Elimina tutti i giocatori"}
          </button>
          {playersProg.running && (
            <span className="text-sm text-gray-700">
              Cancellati: {playersProg.deleted}
              {playersProg.lastBatch > 0 ? ` (+${playersProg.lastBatch})` : ""}
            </span>
          )}
        </div>
      </section>

      {/* ====== SVUOTA PARTITE (client) ====== */}
      <section className="rounded-2xl border bg-white p-4 space-y-2">
        <h2 className="text-lg font-medium">Svuota tutte le partite (client)</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={handleDeleteMatches}
            disabled={matchesProg.running}
            className={`rounded-xl px-4 py-2 text-white ${
              matchesProg.running
                ? "bg-gray-400 cursor-not-allowed"
                : confirmMatches
                ? "bg-orange-600 hover:bg-orange-700"
                : "bg-orange-500 hover:bg-orange-600"
            }`}
          >
            {matchesProg.running
              ? "Eliminazione partite…"
              : confirmMatches
              ? "Conferma: svuota TUTTE"
              : "Svuota tutte le partite"}
          </button>
          {matchesProg.running && (
            <span className="text-sm text-gray-700">
              Cancellate: {matchesProg.deleted}
              {matchesProg.lastBatch > 0 ? ` (+${matchesProg.lastBatch})` : ""}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500">
          Nota: questo bottone cancella lato client. Il reset ufficiale usa l'endpoint server sopra.
        </p>
      </section>

      {phase && phase === 'campionato-completato' && phase !== 'supercoppa' && (
        <div className="mt-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <h3 className="mb-2 text-lg font-semibold text-yellow-800">Campionato completato</h3>
          <p className="mb-3 text-yellow-700">
            Puoi avviare la Supercoppa: genererà le coppie e il calendario.
          </p>

          <button
            onClick={handleStartSupercoppa}
            disabled={starting}
            className={`rounded-lg px-4 py-2 text-white ${starting ? 'bg-yellow-400' : 'bg-yellow-600 hover:bg-yellow-700'}`}
          >
            {starting ? 'Attivazione…' : 'Attiva Supercoppa'}
          </button>

          {msg && <div className="mt-3 text-sm text-emerald-700">{msg}</div>}
          {err && <div className="mt-3 text-sm text-red-600">Errore: {err}</div>}
        </div>
      )}

      {phase === 'supercoppa' && (
        <div className="mt-6 rounded-lg border border-purple-200 bg-purple-50 p-4">
          <h3 className="mb-2 text-lg font-semibold text-purple-800">Supercoppa attiva</h3>
          <p className="mb-3 text-purple-700">
            Avanza automaticamente i vincitori ai round successivi.
          </p>

          <button
            onClick={handleAdvanceSupercoppa}
            disabled={advancing}
            className={`rounded-lg px-4 py-2 text-white ${advancing ? 'bg-purple-400' : 'bg-purple-600 hover:bg-purple-700'}`}
          >
            {advancing ? 'Avanzamento…' : 'Avanza Vincitori'}
          </button>

          {advanceMsg && <div className="mt-3 text-sm text-emerald-700">{advanceMsg}</div>}
          {advanceErr && <div className="mt-3 text-sm text-red-600">Errore: {advanceErr}</div>}
        </div>
      )}
    </main>
  );
}
