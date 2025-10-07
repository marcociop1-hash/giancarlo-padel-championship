"use client";

import React, { useEffect, useMemo, useState, useCallback, memo } from "react";
import { db, auth } from "../lib/firebase";
import { isUserAdmin } from "../lib/admin";
import {
  collection,
  getDocs,
  serverTimestamp,
  getDoc,
  query,
  where,
} from "firebase/firestore";
import { onAuthStateChanged, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";
import TournamentBracket from "./TournamentBracket";
import SupercoppaWinnerBanner from "./SupercoppaWinnerBanner";
import SupercoppaCompletedBanner from "./SupercoppaCompletedBanner";

/* ============================
   Utils: normalizzazione squadre (memoizzate)
   ============================ */
const normalizeTeam = (() => {
  const cache = new Map();
  
  return (team, playersMap) => {
    const cacheKey = JSON.stringify(team) + playersMap.size;
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    if (!team) {
      const result = { a: { id: null, name: "??" }, b: { id: null, name: "??" } };
      cache.set(cacheKey, result);
      return result;
    }

    const toPlayer = (x) => {
      if (!x) return { id: null, name: "??" };
      if (typeof x === "string") {
        const name =
          playersMap.get(x)?.name ||
          playersMap.get(x)?.Nome ||
          playersMap.get(x)?.displayName ||
          x;
        return { id: x, name };
      }
      const id = x.id || x.uid || null;
      const nameFromId =
        id
          ? playersMap.get(id)?.name ||
            playersMap.get(id)?.Nome ||
            playersMap.get(id)?.displayName
          : null;
      const name = x.name || x.Nome || x.displayName || nameFromId || "??";
      return { id, name };
    };

    let result;
    if (Array.isArray(team)) {
      const a = toPlayer(team[0]);
      const b = toPlayer(team[1]);
      result = { a, b };
    } else if (team.player1 || team.player2) {
      result = { a: toPlayer(team.player1), b: toPlayer(team.player2) };
    } else if (team.A || team.B) {
      result = { a: toPlayer(team.A), b: toPlayer(team.B) };
    } else {
      const vals = Object.values(team);
      if (vals.length >= 2) {
        result = { a: toPlayer(vals[0]), b: toPlayer(vals[1]) };
      } else {
        result = { a: { id: null, name: "??" }, b: { id: null, name: "??" } };
      }
    }

    cache.set(cacheKey, result);
    return result;
  };
})();

const teamLabel = (() => {
  const cache = new Map();
  
  return (team, playersMap) => {
    const cacheKey = JSON.stringify(team) + playersMap.size;
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    const t = normalizeTeam(team, playersMap);
    const result = `${t.a.name} & ${t.b.name}`;
    cache.set(cacheKey, result);
    return result;
  };
})();

// StatusBadge ottimizzato con memo
const StatusBadge = memo(({ status }) => {
  const statusConfig = useMemo(() => {
    const configs = {
      completed: { cls: "bg-emerald-100 text-emerald-800", label: "Completata" },
      confirmed: { cls: "bg-teal-100 text-teal-800", label: "Confermata" },
      scheduled: { cls: "bg-blue-100 text-blue-800", label: "Programm." },
      pending: { cls: "bg-blue-100 text-blue-800", label: "Programm." },
    };
    return configs[status] || { cls: "bg-gray-100 text-gray-800", label: "Bozza" };
  }, [status]);

  return (
    <span className={`rounded px-2 py-0.5 text-xs ${statusConfig.cls}`}>
      {statusConfig.label}
    </span>
  );
});

StatusBadge.displayName = 'StatusBadge';

/* ============================
   Componente principale con TAB
   ============================ */
export default function PadelTournamentApp() {
  const [tab, setTab] = useState("home");
  const [me, setMe] = useState(null);
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [supercoppaMatches, setSupercoppaMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [phase, setPhase] = useState(null);
  const [showWinnerBanner, setShowWinnerBanner] = useState(false);
  const [recoveryMatches, setRecoveryMatches] = useState([]);

  // Stati per modifica profilo
  const [profileEdit, setProfileEdit] = useState({
    newUsername: "",
    newPassword: "",
    currentPassword: "",
    showForm: false,
    loading: false,
    error: "",
    success: ""
  });

  // Helper per verificare se l'utente è admin
  const isAdmin = useMemo(() => {
    return isUserAdmin(me);
  }, [me]);

  // auth - ottimizzato con useCallback
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setMe(u || null));
    return () => unsub();
  }, []);

  // dati - ottimizzato con useCallback e gestione errori migliorata
  useEffect(() => {
    let mounted = true;
    let abortController = new AbortController();

    const loadData = async () => {
      try {
        const [pSnap, mSnap] = await Promise.all([
          getDocs(collection(db, "players")),
          getDocs(collection(db, "matches")),
        ]);
        
        if (!mounted || abortController.signal.aborted) return;
        
        setPlayers(pSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })));
        setMatches(mSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })));
      } catch (e) {
        if (mounted && !abortController.signal.aborted) {
          console.error(e);
          setMsg((e && (e.message || String(e))) || "Errore nel caricamento.");
        }
      } finally {
        if (mounted && !abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      mounted = false;
      abortController.abort();
    };
  }, []);

  // Carica partite Supercoppa - ottimizzato
  useEffect(() => {
    let mounted = true;
    let abortController = new AbortController();

    const loadSupercoppaMatches = async () => {
      try {
        // Carica tutte le partite e filtra lato client per evitare problemi di indici
        const snap = await getDocs(collection(db, "matches"));
        
        if (!mounted || abortController.signal.aborted) return;
        
        const allMatches = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
        const supercoppaData = allMatches.filter(m => m.phase === "supercoppa");
        setSupercoppaMatches(supercoppaData);
        
        // Carica anche le partite da recuperare
        const recoveryData = allMatches.filter(m => m.status === "da recuperare");
        setRecoveryMatches(recoveryData);
      } catch (e) {
        if (mounted && !abortController.signal.aborted) {
          console.error("Errore caricamento partite Supercoppa:", e);
        }
      }
    };

    loadSupercoppaMatches();

    return () => {
      mounted = false;
      abortController.abort();
    };
  }, []);

  // fase - ottimizzato
  useEffect(() => {
    let mounted = true;
    
    const loadPhase = async () => {
      try {
        const cfg = await getDoc(doc(db, "config", "tournament"));
        if (mounted) {
          setPhase((cfg.data()?.phase) || "campionato");
        }
      } catch {
        if (mounted) {
          setPhase("campionato");
        }
      }
    };

    loadPhase();

    return () => {
      mounted = false;
    };
  }, []);

  // mappa id → player - ottimizzata con useMemo
  const playersMap = useMemo(() => {
    const m = new Map();
    for (const p of players) {
      const name = p.name || p.Nome || p.displayName || p.id || "??";
      m.set(p.id, { ...p, name });
    }
    return m;
  }, [players]);

  // helper per capire se sono in una partita - ottimizzato con useCallback
  const isMeInMatch = useCallback(
    (m) => {
      if (!me) return false;
      const normA = normalizeTeam(m.teamA, playersMap);
      const normB = normalizeTeam(m.teamB, playersMap);
      const myId = me.uid;
      return (
        normA.a.id === myId ||
        normA.b.id === myId ||
        normB.a.id === myId ||
        normB.b.id === myId
      );
    },
    [me, playersMap]
  );

  // Funzioni per modifica profilo
  const handleProfileUpdate = useCallback(async () => {
    if (!me) return;
    
    setProfileEdit(prev => ({ ...prev, loading: true, error: "", success: "" }));
    
    try {
      const { newUsername, newPassword, currentPassword } = profileEdit;
      
      // Se si vuole cambiare password, serve la password corrente per la riautenticazione
      if (newPassword && currentPassword) {
        const credential = EmailAuthProvider.credential(me.email, currentPassword);
        await reauthenticateWithCredential(me, credential);
      }
      
      // Aggiorna password se fornita
      if (newPassword) {
        await updatePassword(me, newPassword);
      }
      
      // Aggiorna username nel profilo Firestore se fornito
      if (newUsername && newUsername !== me.username) {
        console.log('🔍 Aggiornando username via API:', { newUsername, currentUsername: me.username });
        
        // Ottieni il token di autenticazione
        const token = await me.getIdToken();
        
        // Chiama l'API server-side per aggiornare l'username
        const response = await fetch('/api/profile/update', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ newUsername })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || 'Errore aggiornamento username');
        }
        
        console.log('✅ Username aggiornato con successo:', data);
        
        // Aggiorna l'username nell'oggetto me per riflettere immediatamente il cambiamento
        setMe(prev => ({
          ...prev,
          username: newUsername
        }));
      }
      
      setProfileEdit(prev => ({
        ...prev,
        loading: false,
        success: "Profilo aggiornato con successo!",
        newUsername: "",
        newPassword: "",
        currentPassword: "",
        showForm: false
      }));
      
    } catch (error) {
      console.error("Errore aggiornamento profilo:", error);
      setProfileEdit(prev => ({
        ...prev,
        loading: false,
        error: error.message || "Errore nell'aggiornamento del profilo"
      }));
    }
  }, [me, profileEdit]);

  const resetProfileForm = useCallback(() => {
    setProfileEdit({
      newUsername: "",
      newPassword: "",
      currentPassword: "",
      showForm: false,
      loading: false,
      error: "",
      success: ""
    });
  }, []);

  // liste base - ottimizzate con useMemo e sorting migliorato
  const scheduled = useMemo(
    () =>
      matches
        .filter((m) => m.status === "scheduled" || m.status === "pending")
        .sort((a, b) => {
          const dateA = a.date || a.createdAt || 0;
          const dateB = b.date || b.createdAt || 0;
          return dateA - dateB || (a.id > b.id ? 1 : -1);
        }),
    [matches]
  );
  
  const confirmed = useMemo(
    () =>
      matches
        .filter((m) => m.status === "confirmed")
        .sort((a, b) => {
          const dateA = a.date || a.createdAt || 0;
          const dateB = b.date || b.createdAt || 0;
          return dateA - dateB || (a.id > b.id ? 1 : -1);
        }),
    [matches]
  );
  
  const completed = useMemo(
    () =>
      matches
        .filter((m) => m.status === "completed")
        .sort((a, b) => {
          const dateA = a.date || a.createdAt || 0;
          const dateB = b.date || b.createdAt || 0;
          return dateA - dateB || (a.id > b.id ? 1 : -1);
        }),
    [matches]
  );

  const recovery = useMemo(
    () =>
      matches
        .filter((m) => m.status === "da recuperare")
        .sort((a, b) => {
          const dateA = a.date || a.createdAt || 0;
          const dateB = b.date || b.createdAt || 0;
          return dateA - dateB || (a.id > b.id ? 1 : -1);
        }),
    [matches]
  );

  /* ========= CALENDARIO: filtri + grouping by date ========= */
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const calendarBase = useMemo(
    () => [...scheduled, ...confirmed, ...completed, ...recovery],
    [scheduled, confirmed, completed, recovery]
  );

  const calendarFiltered = useMemo(() => {
    let list = calendarBase;

    if (statusFilter === "upcoming") {
      list = list.filter((m) => m.status === "pending" || m.status === "scheduled");
    } else if (statusFilter === "confirmed") {
      list = list.filter((m) => m.status === "confirmed");
    } else if (statusFilter === "completed") {
      list = list.filter((m) => m.status === "completed");
    } else if (statusFilter === "recovery") {
      list = list.filter((m) => m.status === "da recuperare");
    }

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((m) => {
        const a = teamLabel(m.teamA, playersMap).toLowerCase();
        const b = teamLabel(m.teamB, playersMap).toLowerCase();
        const place = (m.place || "").toLowerCase();
        return a.includes(q) || b.includes(q) || place.includes(q);
      });
    }

    return list.sort((a, b) => {
      const dateA = a.date || a.createdAt || 0;
      const dateB = b.date || b.createdAt || 0;
      return dateA - dateB || (a.id > b.id ? 1 : -1);
    });
  }, [calendarBase, statusFilter, search, playersMap]);

  const calendarByMatchday = useMemo(() => {
    const groups = new Map();
    for (const m of calendarFiltered) {
      // Raggruppa per giornata, con gestione speciale per supercoppa
      let key;
      if (m.phase === 'supercoppa') {
        key = m.roundLabel || 'Supercoppa';
      } else {
        key = m.matchday ? `Giornata ${m.matchday}` : "Senza giornata";
      }
      
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(m);
    }
    
    return Array.from(groups.entries()).sort((a, b) => {
      // Ordine speciale per supercoppa
      const supercoppaOrder = ['Quarti di finale', 'Semifinali', 'Finale'];
      const aIndex = supercoppaOrder.indexOf(a[0]);
      const bIndex = supercoppaOrder.indexOf(b[0]);
      
      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }
      if (aIndex !== -1) return 1; // Supercoppa dopo campionato
      if (bIndex !== -1) return -1;
      
      // Per il campionato, ordina per numero giornata
      if (a[0] === "Senza giornata") return 1;
      if (b[0] === "Senza giornata") return -1;
      
      // Estrai numero giornata per ordinamento numerico
      const aNum = parseInt(a[0].replace('Giornata ', '')) || 0;
      const bNum = parseInt(b[0].replace('Giornata ', '')) || 0;
      return aNum - bNum;
    });
  }, [calendarFiltered]);

  /* ========= STATISTICHE PERSONALI ========= */
  const myStats = useMemo(() => {
    if (!me?.uid || !matches.length) {
      return {
        matchesPlayed: 0,
        wins: 0,
        points: 0,
        winRate: "0%"
      };
    }

    const myMatches = matches.filter(m => {
      if (m.status !== "completed") return false;
      
      const normA = normalizeTeam(m.teamA, playersMap);
      const normB = normalizeTeam(m.teamB, playersMap);
      const myId = me.uid;
      
      return (
        normA.a.id === myId ||
        normA.b.id === myId ||
        normB.a.id === myId ||
        normB.b.id === myId
      );
    });

    let wins = 0;
    let totalPoints = 0;

    myMatches.forEach(m => {
      const normA = normalizeTeam(m.teamA, playersMap);
      const normB = normalizeTeam(m.teamB, playersMap);
      const myId = me.uid;
      
      // Determina se sono nel team A o B
      const iAmInTeamA = normA.a.id === myId || normA.b.id === myId;
      const iAmInTeamB = normB.a.id === myId || normB.b.id === myId;
      
      if (iAmInTeamA) {
        if (m.scoreA > m.scoreB) wins++;
        totalPoints += m.scoreA || 0;
      } else if (iAmInTeamB) {
        if (m.scoreB > m.scoreA) wins++;
        totalPoints += m.scoreB || 0;
      }
    });

    const winRate = myMatches.length > 0 ? Math.round((wins / myMatches.length) * 100) : 0;

    return {
      matchesPlayed: myMatches.length,
      wins,
      points: totalPoints,
      winRate: `${winRate}%`
    };
  }, [me?.uid, matches, playersMap]);

  /* ========= SUPERCOPPA: logica completamento e vincitori ========= */
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

  // Mostra automaticamente il banner quando la Supercoppa è completata
  useEffect(() => {
    if (supercoppaCompleted.isCompleted && !showWinnerBanner) {
      setShowWinnerBanner(true);
    }
  }, [supercoppaCompleted.isCompleted]); // Rimosso showWinnerBanner dalle dipendenze

  /* ========= Card partita (memo, form con stato locale) ========= */
  const MatchCard = memo(function MatchCard({ m, me, playersMap, onConfirmed }) {
    const a = teamLabel(m.teamA, playersMap);
    const b = teamLabel(m.teamB, playersMap);
    const score =
      typeof m.scoreA === "number" && typeof m.scoreB === "number"
        ? `${m.scoreA} - ${m.scoreB}`
        : m.result || "";

    const normA = normalizeTeam(m.teamA, playersMap);
    const normB = normalizeTeam(m.teamB, playersMap);
    const myId = me?.uid || null;
    const iAmInMatch =
      myId &&
      (normA.a.id === myId ||
        normA.b.id === myId ||
        normB.a.id === myId ||
        normB.b.id === myId);
    const meCanConfirm =
      iAmInMatch && (m.status === "pending" || m.status === "scheduled");

    // Stato LOCALE del form (evita rimontaggi e salti mentre digiti)
    const [place, setPlace] = useState(m.place || "");
    const [date, setDate] = useState(m.date || "");
    const [time, setTime] = useState(m.time || "");
    const [saving, setSaving] = useState(false);
    const [localMsg, setLocalMsg] = useState("");
    
    // Stato per form di recupero
    const [showRecoveryForm, setShowRecoveryForm] = useState(false);
    const [recoveryScoreA, setRecoveryScoreA] = useState("");
    const [recoveryScoreB, setRecoveryScoreB] = useState("");
    const [recoverySaving, setRecoverySaving] = useState(false);

    const confirmMatch = useCallback(async () => {
      if (!place || !date || !time) {
        setLocalMsg("Compila campo, data e ora.");
        return;
      }
      setSaving(true);
      try {
        // Ottieni il token di autenticazione
        const token = await auth.currentUser?.getIdToken();
        if (!token) {
          throw new Error("Utente non autenticato");
        }

        // Chiama l'API per aggiornare i dettagli della partita
        const response = await fetch("/api/matches/update-details", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({
            matchId: m.id,
            place: place.trim(),
            date: date.trim(),
            time: time.trim()
          })
        });

        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || "Errore nella conferma");
        }

        setLocalMsg("Partita confermata!");
        onConfirmed?.(m.id, { place, date, time });
      } catch (e) {
        setLocalMsg((e && (e.message || String(e))) || "Errore nella conferma.");
      } finally {
        setSaving(false);
      }
    }, [place, date, time, m.id, onConfirmed]);

  const saveRecoveryResult = useCallback(async () => {
    if (!recoveryScoreA || !recoveryScoreB) {
      setLocalMsg("Inserisci entrambi i punteggi.");
      return;
    }
    
    const scoreA = parseInt(recoveryScoreA);
    const scoreB = parseInt(recoveryScoreB);
    
    // Validazione punteggi padel (0-3, 1-2, 2-1, 3-0)
    const validScores = [
      [0, 3], [1, 2], [2, 1], [3, 0]
    ];
    
    const isValidScore = validScores.some(([a, b]) => 
      (scoreA === a && scoreB === b) || (scoreA === b && scoreB === a)
    );
    
    if (isNaN(scoreA) || isNaN(scoreB) || !isValidScore) {
      setLocalMsg("Punteggi non validi. Usa: 3-0, 2-1, 1-2, 0-3");
      return;
    }
      
      setRecoverySaving(true);
      try {
        // Ottieni il token di autenticazione
        const token = await auth.currentUser?.getIdToken();
        if (!token) {
          throw new Error("Utente non autenticato");
        }

        // Chiama l'API per aggiornare il risultato della partita
        const response = await fetch("/api/matches/update-details", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({
            matchId: m.id,
            scoreA: scoreA,
            scoreB: scoreB,
            status: "completed"
          })
        });

        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || "Errore nel salvataggio");
        }

        setLocalMsg("Risultato salvato! Partita completata.");
        setTimeout(() => setLocalMsg(""), 3000);
        
        // Ricarica i dati
        window.location.reload();
      } catch (error) {
        console.error("Errore:", error);
        setLocalMsg(error.message || "Errore nel salvataggio");
      } finally {
        setRecoverySaving(false);
      }
    }, [recoveryScoreA, recoveryScoreB, m.id]);

    return (
      <div className="rounded-xl border bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-gray-500">
            {m.round ? `R${m.round}` : ""}{" "}
            {typeof m.position === "number" ? `• P${m.position}` : ""}
          </div>
          <StatusBadge status={m.status} />
        </div>

        <div className="mt-2 text-base">
          <div className="font-medium">{a}</div>
          <div className="text-gray-500">vs</div>
          <div className="font-medium">{b}</div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-600">
          {m.status === "da recuperare" ? (
            <div className="flex items-center gap-2">
              <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded-full text-xs font-medium">
                ⏸️ Da Recuperare
              </span>
              {isAdmin ? (
                <button
                  onClick={() => setShowRecoveryForm(m.id)}
                  className="bg-orange-600 text-white px-3 py-1 rounded text-xs hover:bg-orange-700 transition-colors"
                >
                  Inserisci Risultato
                </button>
              ) : (
                <span className="text-xs text-gray-500 italic">
                  Contatta l'admin per inserire il risultato
                </span>
              )}
            </div>
          ) : (
            <>
              {(m.place || place) && <span>📍 {m.place || place}</span>}
              {(m.date || date) && <span>📅 {m.date || date}</span>}
              {(m.time || time) && <span>🕒 {m.time || time}</span>}
              {score && <span>🏁 {score}</span>}
              {m.winnerTeam && (
                <span>🏆 {m.winnerTeam === "A" ? a : m.winnerTeam === "B" ? b : ""}</span>
              )}
            </>
          )}
        </div>

        {/* Form conferma per il giocatore */}
        {meCanConfirm && (
          <div className="mt-3 rounded-lg border bg-gray-50 p-3">
            <div className="mb-2 text-sm font-medium text-gray-700">
              Conferma partita (campo, data, ora)
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input
                className="rounded-md border px-2 py-1 text-sm"
                placeholder="Campo"
                value={place}
                onChange={(e) => setPlace(e.target.value)}
              />
              <input
                className="rounded-md border px-2 py-1 text-sm"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <input
                className="rounded-md border px-2 py-1 text-sm"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={confirmMatch}
                disabled={saving}
                className="rounded-md bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
              >
                {saving ? "Salvataggio…" : "Conferma"}
              </button>
              {localMsg && (
                <span className="text-xs text-gray-600">{localMsg}</span>
              )}
            </div>
          </div>
        )}

        {/* Form recupero per partite da recuperare */}
        {m.status === "da recuperare" && showRecoveryForm && (
          <div className="mt-3 rounded-lg border bg-orange-50 p-3">
            <div className="mb-2 text-sm font-medium text-gray-700">
              Inserisci risultato partita da recuperare
            </div>
           <div className="grid grid-cols-2 gap-2">
             <div>
               <label className="block text-xs text-gray-600 mb-1">Punteggio {a}</label>
               <input
                 className="w-full rounded-md border px-2 py-1 text-sm"
                 type="number"
                 min="0"
                 max="3"
                 placeholder="0-3"
                 value={recoveryScoreA}
                 onChange={(e) => setRecoveryScoreA(e.target.value)}
               />
             </div>
             <div>
               <label className="block text-xs text-gray-600 mb-1">Punteggio {b}</label>
               <input
                 className="w-full rounded-md border px-2 py-1 text-sm"
                 type="number"
                 min="0"
                 max="3"
                 placeholder="0-3"
                 value={recoveryScoreB}
                 onChange={(e) => setRecoveryScoreB(e.target.value)}
               />
             </div>
           </div>
           <div className="mt-1 text-xs text-gray-500">
             Punteggi validi: 3-0, 2-1, 1-2, 0-3
           </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={saveRecoveryResult}
                disabled={recoverySaving}
                className="rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60"
              >
                {recoverySaving ? "Salvataggio…" : "Salva Risultato"}
              </button>
              <button
                onClick={() => setShowRecoveryForm(false)}
                className="rounded-md bg-gray-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-600"
              >
                Annulla
              </button>
              {localMsg && (
                <span className="text-xs text-gray-600">{localMsg}</span>
              )}
            </div>
          </div>
        )}
      </div>
    );
  });

  // callback: aggiorna localmente lo stato match dopo conferma (no rimontaggi globali)
  const onMatchConfirmed = useCallback((id, patch) => {
    setMatches((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch, status: "confirmed" } : m))
    );
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border bg-white p-4">
        Caricamento…
      </div>
    );
  }

  const getFullTabName = (key) => {
    switch (key) {
      case "home":
        return "Home";
      case "mie":
        return "Le mie partite";
      case "calendario":
        return "Calendario";
      case "classifica":
        return "Classifica";
      case "supercoppa":
        return "Supercoppa";
      case "recuperi":
        return "Partite da Recuperare";
      case "profilo":
        return "Profilo";
      default:
        return "";
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header / Tabs */}
      <div className="rounded-2xl border bg-white p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-emerald-600 text-white grid place-items-center">
              🎾
            </div>
            <div>
              <div className="text-sm text-gray-600">Giancarlo Padel</div>
              <div className="font-semibold -mt-1">Championship</div>
            </div>
          </div>

          <div className="hidden items-center gap-2 sm:flex">
            {[
              ["home", "Home"],
              ["mie", "Le mie partite"],
              ["calendario", "Calendario"],
              ["classifica", "Classifica"],
              ["supercoppa", "Supercoppa"],
              ["recuperi", "Recuperi"],
              ["profilo", "Profilo"],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`rounded-lg border px-3 py-1 text-sm ${
                  tab === key
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-white text-gray-700 hover:bg-gray-50"
                }`}
                title={label}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Tabs per mobile - Con icone per maggiore chiarezza */}
        <div className="mt-3 flex gap-1 sm:hidden overflow-hidden">
          {[
            ["home", "🏠", "Home"],
            ["mie", "👤", "Mie"],
            ["calendario", "📅", "Cal."],
            ["classifica", "🏆", "Class."],
            ["supercoppa", "⚡", "Super."],
            ["recuperi", "⏸️", "Rec."],
            ["profilo", "⚙️", "Prof."],
          ].map(([key, icon, shortLabel]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 min-w-0 rounded-lg border px-1 py-2.5 text-center transition-all relative ${
                tab === key
                  ? "bg-emerald-600 text-white border-emerald-600 shadow-lg"
                  : "bg-white text-gray-700 hover:bg-gray-50 border-gray-300"
              }`}
              title={`${shortLabel} - ${getFullTabName(key)}`}
            >
              {tab === key && (
                <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-emerald-400 rounded-full"></div>
              )}
              <div className={`text-base mb-0.5 ${tab === key ? 'text-white' : 'text-gray-600'}`}>{icon}</div>
              <div className="text-xs font-medium leading-none">{shortLabel}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Contenuto tab */}
      <div className="mt-4 rounded-2xl border bg-white p-4">
        {msg && (
          <div className="mb-3 rounded-md bg-yellow-50 p-3 text-sm text-yellow-800">
            {msg}
          </div>
        )}

        {tab === "home" && (
          <div className="space-y-6">
            {/* Prossime partite */}
            <Section title="Prossime partite (tu)">
              {calendarBase.filter((m) => isMeInMatch(m) && m.status !== "completed").length ? (
                <div className="space-y-3">
                  {calendarBase
                    .filter((m) => isMeInMatch(m) && m.status !== "completed")
                    .map((m) => (
                      <MatchCard
                        key={m.id}
                        m={m}
                        me={me}
                        playersMap={playersMap}
                        onConfirmed={onMatchConfirmed}
                      />
                    ))}
                </div>
              ) : (
                <Empty>Nessuna partita.</Empty>
              )}
            </Section>

            {/* Partite da recuperare (se presenti) */}
            {recoveryMatches.length > 0 && (
              <Section title="Partite da Recuperare">
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-orange-600">⏸️</span>
                    <span className="font-medium text-orange-800">
                      Hai {recoveryMatches.length} partita{recoveryMatches.length > 1 ? 'e' : ''} da recuperare
                    </span>
                  </div>
                  <p className="text-sm text-orange-700 mb-3">
                    Queste partite sono state rinviate e non influenzano la classifica attuale.
                  </p>
                  <button
                    onClick={() => setTab("recuperi")}
                    className="text-sm bg-orange-600 text-white px-3 py-1 rounded hover:bg-orange-700 transition-colors"
                  >
                    Vedi Dettagli
                  </button>
                </div>
              </Section>
            )}
          </div>
        )}

        {tab === "mie" && (
          <Section title="Le mie partite">
            {calendarBase.filter((m) => isMeInMatch(m)).length ? (
              <div className="space-y-3">
                {calendarBase.filter((m) => isMeInMatch(m)).map((m) => (
                  <MatchCard
                    key={m.id}
                    m={m}
                    me={me}
                    playersMap={playersMap}
                    onConfirmed={onMatchConfirmed}
                  />
                ))}
              </div>
            ) : (
              <Empty>Nessuna partita.</Empty>
            )}
          </Section>
        )}

        {tab === "calendario" && (
          <div className="space-y-4">
            {/* FILTRI */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Chip
                  active={statusFilter === "all"}
                  onClick={() => setStatusFilter("all")}
                >
                  Tutti
                </Chip>
                <Chip
                  active={statusFilter === "upcoming"}
                  onClick={() => setStatusFilter("upcoming")}
                >
                  In programma
                </Chip>
                <Chip
                  active={statusFilter === "confirmed"}
                  onClick={() => setStatusFilter("confirmed")}
                >
                  Confermate
                </Chip>
                <Chip
                  active={statusFilter === "completed"}
                  onClick={() => setStatusFilter("completed")}
                >
                  Giocate
                </Chip>
                <Chip
                  active={statusFilter === "recovery"}
                  onClick={() => setStatusFilter("recovery")}
                >
                  Da Recuperare
                </Chip>
              </div>
              <div className="sm:ml-auto w-full sm:w-auto">
                <input
                  className="w-full sm:w-auto rounded-md border px-3 py-1.5 text-sm"
                  placeholder="Cerca giocatore o campo…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            {/* GRUPPI PER GIORNATA */}
            {calendarByMatchday.length ? (
              <div className="space-y-6">
                {calendarByMatchday.map(([matchday, list]) => (
                  <div key={matchday}>
                    <div className="sticky top-16 z-10 -mx-4 mb-2 bg-white/80 px-4 py-1 text-xs font-semibold text-gray-500 backdrop-blur">
                      {matchday} ({list.length} partite)
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {list.map((m) => (
                        <MatchCard
                          key={m.id}
                          m={m}
                          me={me}
                          playersMap={playersMap}
                          onConfirmed={onMatchConfirmed}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty>Nessuna partita.</Empty>
            )}
          </div>
        )}

        {tab === "classifica" && (
          <Section title="Classifica">
            <ClassificaTab />
          </Section>
        )}

        {tab === "supercoppa" && (
          <div>
            <Section title="Supercoppa">
              {supercoppaMatches.length > 0 ? (
                <div>
                  {/* Header con statistiche */}
                  <div className="mb-6">
                    <div className="text-center mb-4">
                      <div className="text-2xl mb-2">🏆</div>
                      <h2 className="text-xl font-bold text-gray-800">Supercoppa</h2>
                      <p className="text-gray-600">Torneo ad eliminazione diretta</p>
                    </div>
                    
                    {/* Statistiche partite */}
                    <div className="grid grid-cols-4 gap-3">
                      <div className="bg-blue-50 rounded-lg p-3 text-center">
                        <div className="text-lg font-bold text-blue-700">{supercoppaMatches.length}</div>
                        <div className="text-xs text-blue-600">Partite Totali</div>
                      </div>
                      <div className="bg-green-50 rounded-lg p-3 text-center">
                        <div className="text-lg font-bold text-green-700">
                          {supercoppaMatches.filter(m => m.status === "completed").length}
                        </div>
                        <div className="text-xs text-green-600">Completate</div>
                      </div>
                      <div className="bg-teal-50 rounded-lg p-3 text-center">
                        <div className="text-lg font-bold text-teal-700">
                          {supercoppaMatches.filter(m => m.status === "confirmed").length}
                        </div>
                        <div className="text-xs text-teal-600">Confermate</div>
                      </div>
                      <div className="bg-orange-50 rounded-lg p-3 text-center">
                        <div className="text-lg font-bold text-orange-700">
                          {supercoppaMatches.filter(m => m.status === "scheduled" || m.status === "pending").length}
                        </div>
                        <div className="text-xs text-orange-600">Programmate</div>
                      </div>
                    </div>
                  </div>
                  
                  <TournamentBracket 
                    matches={supercoppaMatches}
                    playersMap={playersMap}
                  />
                  
                  {/* Banner completamento */}
                  <SupercoppaCompletedBanner 
                    winners={supercoppaCompleted.winners}
                    isVisible={supercoppaCompleted.isCompleted}
                  />
                  
                  {/* Modal vincitori */}
                  <SupercoppaWinnerBanner 
                    winners={supercoppaCompleted.winners}
                    isVisible={showWinnerBanner}
                    onClose={() => setShowWinnerBanner(false)}
                  />
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 max-w-md mx-auto">
                    <div className="text-4xl mb-4">🏆</div>
                    <h3 className="text-lg font-semibold text-blue-800 mb-2">Supercoppa</h3>
                    <p className="text-blue-700 mb-4">
                      {phase === "campionato" 
                        ? "Il campionato è ancora in corso. La Supercoppa sarà attivata al completamento."
                        : "La Supercoppa non è ancora stata attivata."
                      }
                    </p>
                  </div>
                </div>
              )}
            </Section>
          </div>
        )}

        {tab === "recuperi" && (
          <Section title="Partite da Recuperare">
            {recoveryMatches.length > 0 ? (
              <div>
                {/* Header con statistiche */}
                <div className="mb-6">
                  <div className="text-center mb-4">
                    <div className="text-2xl mb-2">⏸️</div>
                    <h2 className="text-xl font-bold text-gray-800">Partite da Recuperare</h2>
                    <p className="text-gray-600">Partite rinviate o non completate</p>
                  <p className="text-xs text-gray-500 mt-1">
                    <strong>Nota:</strong> Le partite da recuperare bloccano la classifica di tutta la giornata finché non vengono completate
                  </p>
                  </div>
                  
                  {/* Statistiche */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-orange-50 rounded-lg p-3 text-center">
                      <div className="text-lg font-bold text-orange-700">{recoveryMatches.length}</div>
                      <div className="text-xs text-orange-600">Partite da Recuperare</div>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-3 text-center">
                      <div className="text-lg font-bold text-blue-700">
                        {new Set(recoveryMatches.map(m => m.matchday).filter(Boolean)).size}
                      </div>
                      <div className="text-xs text-blue-600">Giornate Coinvolte</div>
                    </div>
                  </div>
                </div>
                
                {/* Lista partite */}
                <div className="space-y-3">
                  {recoveryMatches.map((match) => (
                    <div key={match.id} className="border rounded-lg p-4 bg-yellow-50">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="font-medium text-gray-800 mb-2">
                            Giornata {match.matchday || 'N/A'}
                          </div>
                          <div className="text-sm text-gray-600 mb-2">
                            {teamLabel(match.teamA, playersMap)} vs {teamLabel(match.teamB, playersMap)}
                          </div>
                          {match.recoveryNotes && (
                            <div className="text-xs text-gray-500 bg-white p-2 rounded border">
                              <strong>Note:</strong> {match.recoveryNotes}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-gray-500 mb-1">
                            {match.frozenAt ? new Date(match.frozenAt.toDate()).toLocaleDateString('it-IT') : 'Data sconosciuta'}
                          </div>
                          <div className="text-xs px-2 py-1 bg-orange-200 text-orange-800 rounded-full">
                            Da Recuperare
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="bg-green-50 border border-green-200 rounded-lg p-6 max-w-md mx-auto">
                  <div className="text-4xl mb-4">✅</div>
                  <h3 className="text-lg font-semibold text-green-800 mb-2">Nessuna partita da recuperare</h3>
                  <p className="text-green-700">
                    Tutte le partite sono state completate regolarmente.
                  </p>
                </div>
              </div>
            )}
          </Section>
        )}

        {tab === "profilo" && (
          <div className="space-y-6">
            {/* HEADER PROFILO */}
            <div className="text-center">
              <div className="mx-auto w-24 h-24 bg-gradient-to-br from-emerald-400 to-blue-500 rounded-full flex items-center justify-center mb-4">
                <span className="text-3xl">🎾</span>
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                {me?.username || me?.displayName || me?.email || "Giocatore Padel"}
              </h2>
              <p className="text-gray-600">Benvenuto nel tuo profilo padel! 🏆</p>
            </div>

            {/* STATISTICHE PERSONALI */}
            <div className="bg-white rounded-xl border p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                📊 Le Mie Statistiche
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-emerald-50 rounded-lg">
                  <div className="text-2xl font-bold text-emerald-600">
                    {myStats.matchesPlayed}
                  </div>
                  <div className="text-sm text-gray-600">Partite Giocate</div>
                </div>
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    {myStats.wins}
                  </div>
                  <div className="text-sm text-gray-600">Vittorie</div>
                </div>
                <div className="text-center p-3 bg-purple-50 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">
                    {myStats.points}
                  </div>
                  <div className="text-sm text-gray-600">Punti Totali</div>
                </div>
                <div className="text-center p-3 bg-orange-50 rounded-lg">
                  <div className="text-2xl font-bold text-orange-600">
                    {myStats.winRate}
                  </div>
                  <div className="text-sm text-gray-600">% Vittorie</div>
                </div>
              </div>
            </div>

            {/* MODIFICA PROFILO */}
            <div className="bg-white rounded-xl border p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                ⚙️ Modifica Profilo
              </h3>
              
              {profileEdit.success && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-green-800 text-sm">{profileEdit.success}</p>
                </div>
              )}
              
              {profileEdit.error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-800 text-sm">{profileEdit.error}</p>
                </div>
              )}
              
              {!profileEdit.showForm ? (
                <div className="text-center">
                  <button
                    onClick={() => setProfileEdit(prev => ({ ...prev, showForm: true }))}
                    className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
                  >
                    Modifica Username e Password
                  </button>
                </div>
              ) : (
                <form onSubmit={(e) => { e.preventDefault(); handleProfileUpdate(); }} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Username Attuale
                    </label>
                    <input
                      type="text"
                      value={me?.username || ""}
                      disabled
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nuovo Username
                    </label>
                    <input
                      type="text"
                      value={profileEdit.newUsername}
                      onChange={(e) => setProfileEdit(prev => ({ ...prev, newUsername: e.target.value }))}
                      placeholder="Inserisci nuovo username"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nuova Password
                    </label>
                    <input
                      type="password"
                      value={profileEdit.newPassword}
                      onChange={(e) => setProfileEdit(prev => ({ ...prev, newPassword: e.target.value }))}
                      placeholder="Inserisci nuova password (minimo 6 caratteri)"
                      autoComplete="new-password"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                  
                  {profileEdit.newPassword && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Password Attuale (richiesta per cambiare password)
                      </label>
                      <input
                        type="password"
                        value={profileEdit.currentPassword}
                        onChange={(e) => setProfileEdit(prev => ({ ...prev, currentPassword: e.target.value }))}
                        placeholder="Inserisci la tua password attuale"
                        autoComplete="current-password"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      />
                    </div>
                  )}
                  
                  
                  <div className="flex gap-3">
                    <button
                      onClick={handleProfileUpdate}
                      disabled={profileEdit.loading || (!profileEdit.newUsername && !profileEdit.newPassword) || (profileEdit.newPassword && !profileEdit.currentPassword)}
                      className="flex-1 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {profileEdit.loading ? "Aggiornamento..." : "Aggiorna Profilo"}
                    </button>
                    <button
                      onClick={resetProfileForm}
                      disabled={profileEdit.loading}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                      Annulla
                    </button>
                  </div>
                  
                  <div className="text-xs text-gray-500">
                    <p>• La nuova password deve essere di almeno 6 caratteri</p>
                    <p>• Puoi modificare solo username, solo password, o entrambi</p>
                    <p>• Per cambiare la password è richiesta la password attuale (sicurezza Firebase)</p>
                    <p>• Per cambiare solo l'username non serve la password attuale</p>
                  </div>
                </form>
              )}
            </div>

            {/* CONSIGLI PADEL */}
            <div className="bg-white rounded-xl border p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                💡 Consigli di Gioco
              </h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg">
                  <span className="text-yellow-600 text-lg">🎯</span>
                  <div>
                    <div className="font-medium text-gray-800">Posizionamento</div>
                    <div className="text-sm text-gray-600">Mantieni sempre la posizione a rete per intercettare le palle corte</div>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                  <span className="text-green-600 text-lg">🏓</span>
                  <div>
                    <div className="font-medium text-gray-800">Servizio</div>
                    <div className="text-sm text-gray-600">Varia la velocità e la direzione per confondere l'avversario</div>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                  <span className="text-blue-600 text-lg">🤝</span>
                  <div>
                    <div className="font-medium text-gray-800">Comunicazione</div>
                    <div className="text-sm text-gray-600">Parla sempre con il tuo partner durante il gioco</div>
                  </div>
                </div>
              </div>
            </div>

            {/* EQUIPAGGIAMENTO */}
            <div className="bg-white rounded-xl border p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                🎒 Equipaggiamento Consigliato
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <span className="text-2xl">🏸</span>
                  <div>
                    <div className="font-medium text-gray-800">Racchetta</div>
                    <div className="text-sm text-gray-600">Peso: 360g | Forma: Rotonda</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <span className="text-2xl">👟</span>
                  <div>
                    <div className="font-medium text-gray-800">Scarpe</div>
                    <div className="text-sm text-gray-600">Suola: Gomma | Grip: Alto</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <span className="text-2xl">🎽</span>
                  <div>
                    <div className="font-medium text-gray-800">Abbigliamento</div>
                    <div className="text-sm text-gray-600">Tecnico | Traspirante</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <span className="text-2xl">💧</span>
                  <div>
                    <div className="font-medium text-gray-800">Idratazione</div>
                    <div className="text-sm text-gray-600">Acqua + Integratori</div>
                  </div>
                </div>
              </div>
            </div>



            {/* CITAZIONE MOTIVAZIONALE */}
            <div className="bg-gradient-to-r from-emerald-500 to-blue-500 rounded-xl p-6 text-white text-center">
              <div className="text-3xl mb-3">💪</div>
              <blockquote className="text-lg font-medium mb-2">
                "Il padel non è solo uno sport, è uno stile di vita che ti insegna a non arrenderti mai!"
              </blockquote>
              <div className="text-sm opacity-90">- Giancarlo Padel Championship</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ========== UI helpers ========== */
const Section = memo(({ title, children }) => (
  <div>
    <h3 className="mb-3 text-sm font-semibold text-gray-700">{title}</h3>
    {children}
  </div>
));

const Empty = memo(({ children }) => (
  <div className="rounded-lg border border-dashed py-8 text-center text-sm text-gray-500">
    {children}
  </div>
));

const Chip = memo(({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`rounded-full border px-3 py-1 text-xs ${
      active
        ? "border-emerald-600 bg-emerald-50 text-emerald-700"
        : "bg-white text-gray-700 hover:bg-gray-50"
    }`}
  >
    {children}
  </button>
));

/* ========== COMPONENTE CLASSIFICA COMPLETO ========== */
const ClassificaTab = memo(() => {
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [lastUpdate, setLastUpdate] = React.useState(null);

  const fetchClassifica = React.useCallback(async (forceRefresh = false) => {
    setLoading(true);
    try {
      const url = forceRefresh ? '/api/classifica?refresh=true' : '/api/classifica';
      console.log('Fetching classifica:', url);
      const response = await fetch(url);
      const data = await response.json();
      console.log('Classifica ricevuta:', data);
      setRows(data?.rows || []);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Errore caricamento classifica:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchClassifica();
  }, [fetchClassifica]);

  // Aggiorna automaticamente ogni 10 secondi (ridotto da 30)
  React.useEffect(() => {
    const interval = setInterval(() => {
      fetchClassifica(true); // Force refresh
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchClassifica]);

  if (loading && !rows.length) return <div>Caricamento classifica...</div>;
  if (!rows.length) return <div>Nessun dato disponibile</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">Classifica</h3>
        <div className="flex items-center gap-2">
          {lastUpdate && (
            <span className="text-xs text-gray-500">
              Aggiornato: {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => fetchClassifica(true)}
            className="text-xs bg-emerald-600 text-white px-2 py-1 rounded hover:bg-emerald-700"
          >
            Aggiorna
          </button>
        </div>
      </div>
      
      {/* Legenda */}
      <div className="mb-3 text-xs text-gray-600 bg-gray-50 p-2 rounded">
        <strong>PG:</strong> Partite Giocate • <strong>DG:</strong> Differenza Game vinti/persi • <strong>P:</strong> Punti
      </div>
      <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr>
            <th className="px-3 py-2 text-left">#</th>
            <th className="px-3 py-2 text-left">Giocatore</th>
            <th className="px-3 py-2 text-right">PG</th>
            <th className="px-3 py-2 text-right">DG</th>
            <th className="px-3 py-2 text-right">P</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const podium =
              i === 0 ? '🥇' :
              i === 1 ? '🥈' :
              i === 2 ? '🥉' : null;

            const rowClass =
              i === 0 ? 'bg-yellow-50' :
              i === 1 ? 'bg-gray-100' :
              i === 2 ? 'bg-amber-100' : '';

            return (
              <tr key={r.key} className={rowClass}>
                <td className="px-3 py-2 font-medium">
                  {podium || i + 1}
                </td>
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2 text-right">{r.played}</td>
                <td className="px-3 py-2 text-right">{r.gameDiff || 0}</td>
                <td className="px-3 py-2 text-right">{r.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
});

ClassificaTab.displayName = 'ClassificaTab';
