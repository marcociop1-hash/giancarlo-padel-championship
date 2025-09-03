"use client";

import React, { useEffect, useMemo, useState, useCallback, memo } from "react";
import { db, auth } from "../lib/firebase";
import {
  collection,
  getDocs,
  setDoc,
  doc,
  serverTimestamp,
  getDoc,
  query,
  where,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
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

  /* ========= CALENDARIO: filtri + grouping by date ========= */
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const calendarBase = useMemo(
    () => [...scheduled, ...confirmed, ...completed],
    [scheduled, confirmed, completed]
  );

  const calendarFiltered = useMemo(() => {
    let list = calendarBase;

    if (statusFilter === "upcoming") {
      list = list.filter((m) => m.status === "pending" || m.status === "scheduled");
    } else if (statusFilter === "confirmed") {
      list = list.filter((m) => m.status === "confirmed");
    } else if (statusFilter === "completed") {
      list = list.filter((m) => m.status === "completed");
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

  const calendarByDate = useMemo(() => {
    const groups = new Map();
    for (const m of calendarFiltered) {
      const key = m.date || "Senza data";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(m);
    }
    return Array.from(groups.entries()).sort((a, b) => {
      if (a[0] === "Senza data") return -1;
      if (b[0] === "Senza data") return 1;
      return (a[0] || "").localeCompare(b[0] || "");
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

    return (
      <div className="rounded-xl border bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-gray-500">
            {m.phase ? (m.phase === "fase1" ? "Fase 1" : "Fase 2") : "—"}{" "}
            {m.round ? `• R${m.round}` : ""}{" "}
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
          {(m.place || place) && <span>📍 {m.place || place}</span>}
          {(m.date || date) && <span>📅 {m.date || date}</span>}
          {(m.time || time) && <span>🕒 {m.time || time}</span>}
          {score && <span>🏁 {score}</span>}
          {m.winnerTeam && (
            <span>🏆 {m.winnerTeam === "A" ? a : m.winnerTeam === "B" ? b : ""}</span>
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

        {/* Tabs per mobile */}
        <div className="mt-3 flex gap-1 sm:hidden overflow-hidden">
          {[
            ["home", "Home"],
            ["mie", "Mie"],
            ["calendario", "Cal."],
            ["classifica", "Class."],
            ["supercoppa", "Super."],
            ["recuperi", "Rec."],
            ["profilo", "Profilo"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 min-w-0 rounded-lg border px-1.5 py-2 text-xs font-medium transition-all ${
                tab === key
                  ? "bg-emerald-600 text-white border-emerald-600 shadow-lg"
                  : "bg-white text-gray-700 hover:bg-gray-50 border-gray-300"
              }`}
              title={label}
            >
              <span className="truncate block text-center leading-none">{label}</span>
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

            {/* GRUPPI PER DATA */}
            {calendarByDate.length ? (
              <div className="space-y-6">
                {calendarByDate.map(([day, list]) => (
                  <div key={day}>
                    <div className="sticky top-16 z-10 -mx-4 mb-2 bg-white/80 px-4 py-1 text-xs font-semibold text-gray-500 backdrop-blur">
                      {day === "Senza data" ? "Senza data" : day}
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
                        {recoveryMatches.filter(m => m.originalMatchday).length}
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
                            Giornata {match.originalMatchday || match.matchday}
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
                {me?.displayName || me?.email || "Giocatore Padel"}
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
      <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr>
            <th className="px-3 py-2 text-left">#</th>
            <th className="px-3 py-2 text-left">Giocatore</th>
            <th className="px-3 py-2 text-right">P</th>
            <th className="px-3 py-2 text-right">+/-</th>
            <th className="px-3 py-2 text-right">PG</th>
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
                <td className="px-3 py-2 text-right">{r.points}</td>
                <td className="px-3 py-2 text-right">{r.setDiff}</td>
                <td className="px-3 py-2 text-right">{r.played}</td>
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
