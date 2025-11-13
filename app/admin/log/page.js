"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
// FIX: Forza rebuild per correggere errore standingA
import { db, auth } from "../../../lib/firebase";
import {
  collection,
  getDocs,
  query,
  orderBy,
  where,
} from "firebase/firestore";

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

function teamLabel(team, players = [], standings = [], match = null) {
  const t = normalizeTeam(team);
  
  // Trova sempre i standings per i giocatori - FIX DEPLOY
  const standingA = standings.find(s => s.playerId === t.a.id);
  const standingB = standings.find(s => s.playerId === t.b.id);
  
  // PRIORITÀ: Usa i punteggi salvati al momento della generazione se disponibili
  let scoreA, scoreB, totalScore;
  
  if (match && match.generationPoints) {
    // Usa i punteggi al momento della generazione
    const isTeamA = match.teamA && match.teamA.some(p => p.id === t.a.id);
    if (isTeamA) {
      scoreA = match.generationPoints.teamA.player1.points;
      scoreB = match.generationPoints.teamA.player2.points;
      totalScore = match.generationPoints.teamA.total;
    } else {
      scoreA = match.generationPoints.teamB.player1.points;
      scoreB = match.generationPoints.teamB.player2.points;
      totalScore = match.generationPoints.teamB.total;
    }
  } else {
    // Fallback: usa i punteggi dalla classifica attuale
    scoreA = standingA?.points || 0;
    scoreB = standingB?.points || 0;
    totalScore = scoreA + scoreB;
  }
  
  // Se abbiamo i dati della partita, mostra i game di questa partita specifica
  if (match && match.totalGamesA !== undefined && match.totalGamesB !== undefined) {
    // Determina se questa squadra è teamA o teamB
    const isTeamA = match.teamA && match.teamA.some(p => p.id === t.a.id);
    const matchGames = isTeamA ? match.totalGamesA : match.totalGamesB;
    const opponentGames = isTeamA ? match.totalGamesB : match.totalGamesA;
    
    return `${t.a.name}(${scoreA}) & ${t.b.name}(${scoreB}) [${totalScore}] | Game: ${matchGames}-${opponentGames}`;
  }
  
  // Fallback: usa i game totali del torneo
  const gamesA = standingA?.gamesWon || 0;
  const gamesLostA = standingA?.gamesLost || 0;
  const gamesB = standingB?.gamesWon || 0;
  const gamesLostB = standingB?.gamesLost || 0;
  const totalGamesWon = gamesA + gamesB;
  const totalGamesLost = gamesLostA + gamesLostB;
  
  return `${t.a.name}(${scoreA}) & ${t.b.name}(${scoreB}) [${totalScore}] | Game: ${totalGamesWon}-${totalGamesLost}`;
}

function getStatusColor(status) {
  switch (status) {
    case 'completed': return 'bg-green-100 text-green-800';
    case 'confirmed': return 'bg-yellow-100 text-yellow-800';
    case 'scheduled': return 'bg-blue-100 text-blue-800';
    case 'da recuperare': return 'bg-red-100 text-red-800';
    case 'incomplete': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
}

function getStatusIcon(status) {
  switch (status) {
    case 'completed': return '✅';
    case 'confirmed': return '⏳';
    case 'scheduled': return '📅';
    case 'da recuperare': return '🔄';
    case 'incomplete': return '❌';
    default: return '❓';
  }
}

export default function LogPage() {
  const [matches, setMatches] = useState([]);
  const [players, setPlayers] = useState([]);
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pairCalendar, setPairCalendar] = useState(null);
  
  // Stato per il modal di modifica partita
  const [editingMatch, setEditingMatch] = useState(null);
  const [editForm, setEditForm] = useState({
    place: '',
    date: '',
    time: '',
    scoreA: '',
    scoreB: '',
    totalGamesA: '',
    totalGamesB: '',
    set1Games: { teamA: '', teamB: '' },
    set2Games: { teamA: '', teamB: '' },
    set3Games: { teamA: '', teamB: '' },
    status: 'scheduled'
  });
  const [saving, setSaving] = useState(false);

  const fetchMatches = useCallback(async () => {
    try {
      console.log('[LOG] 🔄 Inizio caricamento partite...');
      console.log('[LOG] 🔍 Firebase db instance:', db ? 'OK' : 'NULL');
      console.log('[LOG] 🔍 Firebase app:', db?.app ? 'OK' : 'NULL');
      
      const startTime = Date.now();
      
      // Prova prima senza orderBy per vedere se il problema è l'indice
      console.log('[LOG] 🔍 Tentativo query matches senza orderBy...');
      let matchesSnap;
      try {
        matchesSnap = await getDocs(collection(db, "matches"));
        console.log('[LOG] ✅ Query matches senza orderBy completata');
      } catch (orderByError) {
        console.error('[LOG] ❌ Errore query senza orderBy:', orderByError);
        console.log('[LOG] 🔍 Tentativo query matches con orderBy...');
        matchesSnap = await getDocs(
          query(collection(db, "matches"), orderBy("createdAt", "desc"))
        );
      }
      
      const duration = Date.now() - startTime;
      console.log(`[LOG] 📊 Query completata in ${duration}ms, docs: ${matchesSnap.docs.length}`);
      
      const matchesData = matchesSnap.docs.map((d) => {
        const data = d.data();
        console.log('[LOG] 📄 Match doc:', { id: d.id, hasData: !!data, status: data?.status });
        return { id: d.id, ...(data || {}) };
      });
      
      console.log(`[LOG] ✅ Partite caricate: ${matchesData.length} in ${duration}ms`);
      setMatches(matchesData);
    } catch (e) {
      console.error("[LOG] ❌ Errore caricamento partite:", e);
      console.error("[LOG] ❌ Dettagli errore:", {
        message: e.message,
        code: e.code,
        stack: e.stack,
        name: e.name
      });
      
      // Se è un errore di indice, prova senza orderBy
      if (e.code === 'failed-precondition' || e.message?.includes('index')) {
        console.log('[LOG] 🔄 Tentativo senza orderBy a causa di errore indice...');
        try {
          const matchesSnap = await getDocs(collection(db, "matches"));
          const matchesData = matchesSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
          console.log(`[LOG] ✅ Partite caricate (senza orderBy): ${matchesData.length}`);
          setMatches(matchesData);
          return;
        } catch (e2) {
          console.error("[LOG] ❌ Errore anche senza orderBy:", e2);
        }
      }
      
      setError("Errore nel caricamento delle partite");
    }
  }, []);

  const fetchPlayers = useCallback(async () => {
    try {
      console.log('[LOG] 🔄 Inizio caricamento giocatori...');
      console.log('[LOG] 🔍 Firebase db instance:', db ? 'OK' : 'NULL');
      
      const startTime = Date.now();
      console.log('[LOG] 🔍 Esecuzione query players...');
      const playersSnap = await getDocs(collection(db, "players"));
      const duration = Date.now() - startTime;
      
      console.log(`[LOG] 📊 Query completata in ${duration}ms, docs: ${playersSnap.docs.length}`);
      
      const playersData = playersSnap.docs.map((d) => {
        const data = d.data();
        console.log('[LOG] 📄 Player doc:', { id: d.id, name: data?.name || data?.Nome || 'N/A', hasData: !!data });
        return { id: d.id, ...(data || {}) };
      });
      
      console.log(`[LOG] ✅ Giocatori caricati: ${playersData.length} in ${duration}ms`);
      setPlayers(playersData);
    } catch (e) {
      console.error("[LOG] ❌ Errore caricamento giocatori:", e);
      console.error("[LOG] ❌ Dettagli errore:", {
        message: e.message,
        code: e.code,
        stack: e.stack,
        name: e.name
      });
      setError("Errore nel caricamento dei giocatori");
    }
  }, []);

  const fetchStandings = useCallback(async () => {
    try {
      console.log('[LOG] 🔄 Inizio caricamento classifica...');
      const startTime = Date.now();
      // Usa cache se disponibile per performance migliori
      const response = await fetch('/api/classifica');
      const duration = Date.now() - startTime;
      console.log(`[LOG] 📡 Response classifica: ${response.status} ${response.statusText} (${duration}ms)`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`[LOG] ✅ Classifica caricata: ${data.rows?.length || 0} giocatori`);
        setStandings(data.rows || []);
      } else {
        const errorText = await response.text();
        console.error('[LOG] ❌ Errore response classifica:', response.status, errorText);
      }
    } catch (e) {
      console.error("[LOG] ❌ Errore caricamento classifica:", e);
      console.error("[LOG] ❌ Dettagli errore:", {
        message: e.message,
        stack: e.stack
      });
    }
  }, []);

  const fetchPairCalendar = useCallback(async () => {
    try {
      console.log('[LOG] 🔄 Inizio caricamento calendario coppie...');
      const startTime = Date.now();
      const response = await fetch('/api/admin/get-pair-calendar');
      const duration = Date.now() - startTime;
      console.log(`[LOG] 📡 Response calendario: ${response.status} ${response.statusText} (${duration}ms)`);
      
      const data = await response.json();
      console.log('[LOG] 📥 Dati calendario ricevuti:', {
        ok: data.ok,
        hasCalendar: !!data.calendar,
        isArray: Array.isArray(data.calendar),
        length: data.calendar?.length,
        message: data.message
      });
      
      if (response.ok && data.ok && data.calendar && Array.isArray(data.calendar) && data.calendar.length > 0) {
        console.log(`[LOG] ✅ Calendario caricato: ${data.calendar.length} giornate`);
        setPairCalendar(data.calendar);
      } else {
        console.warn('[LOG] ⚠️ Calendario non disponibile o vuoto');
      }
    } catch (e) {
      console.error('[LOG] ❌ Errore fetch calendario:', e);
      console.error("[LOG] ❌ Dettagli errore:", {
        message: e.message,
        stack: e.stack
      });
    }
  }, []);

  // Funzione per aprire il modal di modifica
  const openEditModal = useCallback((match) => {
    setEditingMatch(match);
    setEditForm({
      place: match.place || '',
      date: match.date || '',
      time: match.time || '',
      scoreA: match.scoreA !== undefined ? match.scoreA : '',
      scoreB: match.scoreB !== undefined ? match.scoreB : '',
      set1Games: {
        teamA: match.set1Games?.teamA !== undefined ? match.set1Games.teamA : '',
        teamB: match.set1Games?.teamB !== undefined ? match.set1Games.teamB : ''
      },
      set2Games: {
        teamA: match.set2Games?.teamA !== undefined ? match.set2Games.teamA : '',
        teamB: match.set2Games?.teamB !== undefined ? match.set2Games.teamB : ''
      },
      set3Games: {
        teamA: match.set3Games?.teamA !== undefined ? match.set3Games.teamA : '',
        teamB: match.set3Games?.teamB !== undefined ? match.set3Games.teamB : ''
      },
      status: match.status || 'scheduled'
    });
  }, []);

  // Funzione per chiudere il modal
  const closeEditModal = useCallback(() => {
    setEditingMatch(null);
    setEditForm({
      place: '',
      date: '',
      time: '',
      scoreA: '',
      scoreB: '',
      set1Games: { teamA: '', teamB: '' },
      set2Games: { teamA: '', teamB: '' },
      set3Games: { teamA: '', teamB: '' },
      status: 'scheduled'
    });
  }, []);

  // Funzione per salvare le modifiche
  const saveMatchChanges = useCallback(async () => {
    if (!editingMatch) return;
    
    setSaving(true);
    try {
      // Ottieni il token di autenticazione Firebase
      const user = auth.currentUser;
      if (!user) {
        alert('Errore: Utente non autenticato');
        setSaving(false);
        return;
      }
      
      const token = await user.getIdToken();
      
      const response = await fetch('/api/matches/update-details', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          matchId: editingMatch.id,
          place: editForm.place,
          date: editForm.date,
          time: editForm.time,
          ...(editForm.scoreA && { scoreA: parseInt(editForm.scoreA) }),
          ...(editForm.scoreB && { scoreB: parseInt(editForm.scoreB) }),
          status: "completed", // Forza sempre completed quando si modifica dal log
          // Calcola automaticamente i game totali dai set
          ...(editForm.set1Games.teamA || editForm.set1Games.teamB || editForm.set2Games.teamA || editForm.set2Games.teamB || editForm.set3Games.teamA || editForm.set3Games.teamB ? {
            totalGamesA: (parseInt(editForm.set1Games.teamA) || 0) + (parseInt(editForm.set2Games.teamA) || 0) + (parseInt(editForm.set3Games.teamA) || 0),
            totalGamesB: (parseInt(editForm.set1Games.teamB) || 0) + (parseInt(editForm.set2Games.teamB) || 0) + (parseInt(editForm.set3Games.teamB) || 0)
          } : {}),
          ...(editForm.set1Games.teamA || editForm.set1Games.teamB ? {
            set1Games: {
              ...(editForm.set1Games.teamA && { teamA: parseInt(editForm.set1Games.teamA) }),
              ...(editForm.set1Games.teamB && { teamB: parseInt(editForm.set1Games.teamB) })
            }
          } : {}),
          ...(editForm.set2Games.teamA || editForm.set2Games.teamB ? {
            set2Games: {
              ...(editForm.set2Games.teamA && { teamA: parseInt(editForm.set2Games.teamA) }),
              ...(editForm.set2Games.teamB && { teamB: parseInt(editForm.set2Games.teamB) })
            }
          } : {}),
          ...(editForm.set3Games.teamA || editForm.set3Games.teamB ? {
            set3Games: {
              ...(editForm.set3Games.teamA && { teamA: parseInt(editForm.set3Games.teamA) }),
              ...(editForm.set3Games.teamB && { teamB: parseInt(editForm.set3Games.teamB) })
            }
          } : {})
        })
      });

      if (response.ok) {
        alert('Partita aggiornata con successo!');
        closeEditModal();
        fetchMatches(); // Ricarica le partite
        
        // Se sono stati modificati i risultati (scoreA, scoreB), aggiorna la classifica
        if (editForm.scoreA !== '' || editForm.scoreB !== '') {
          try {
            console.log('🔄 Aggiornando classifica dopo modifica risultati...');
            const classificaResponse = await fetch('/api/classifica?refresh=true');
            if (classificaResponse.ok) {
              console.log('✅ Classifica aggiornata con successo');
              fetchStandings(); // Ricarica anche la classifica locale
            } else {
              console.warn('⚠️ Errore nell\'aggiornamento della classifica');
            }
          } catch (classificaError) {
            console.error('❌ Errore nell\'aggiornamento della classifica:', classificaError);
          }
        }
      } else {
        const errorData = await response.json();
        alert(`Errore: ${errorData.error || 'Errore sconosciuto'}`);
      }
    } catch (error) {
      console.error('Errore nel salvataggio:', error);
      alert('Errore nel salvataggio delle modifiche');
    } finally {
      setSaving(false);
    }
  }, [editingMatch, editForm, closeEditModal, fetchMatches]);

  useEffect(() => {
    let mounted = true;
    let cancelled = false;
    
    const loadData = async () => {
      if (cancelled || !mounted) return;
      
      console.log('[LOG] 🚀 Inizio caricamento dati pagina log...');
      const totalStartTime = Date.now();
      setLoading(true);
      
      try {
        // Carica prima i dati essenziali (partite, giocatori, classifica)
        console.log('[LOG] 📦 Caricamento dati essenziali in parallelo...');
        const essentialStartTime = Date.now();
        await Promise.all([fetchMatches(), fetchPlayers(), fetchStandings()]);
        const essentialDuration = Date.now() - essentialStartTime;
        console.log(`[LOG] ✅ Dati essenziali caricati in ${essentialDuration}ms`);
        
        // Carica il calendario in background (non blocca il rendering)
        if (mounted && !cancelled) {
          console.log('[LOG] 📅 Caricamento calendario in background...');
          fetchPairCalendar().catch(err => {
            if (mounted && !cancelled) {
              console.error('[LOG] ❌ Errore caricamento calendario:', err);
            }
          });
        }
      } catch (error) {
        if (mounted && !cancelled) {
          console.error('[LOG] ❌ Errore caricamento dati:', error);
          console.error("[LOG] ❌ Dettagli errore:", {
            message: error.message,
            stack: error.stack
          });
        }
      } finally {
        if (mounted && !cancelled) {
          const totalDuration = Date.now() - totalStartTime;
          console.log(`[LOG] ✅ Caricamento completato in ${totalDuration}ms`);
          setLoading(false);
        }
      }
    };
    
    loadData();
    
    return () => { 
      console.log('[LOG] 🧹 Cleanup useEffect');
      cancelled = true;
      mounted = false; 
    };
  }, []); // Esegui solo una volta al mount

  // Raggruppa le partite per giornata (campionato) o round (supercoppa)
  const matchesByMatchday = useMemo(() => {
    const grouped = {};
    matches.forEach(match => {
      let groupKey;
      
      if (match.phase === 'supercoppa') {
        // Per la supercoppa, raggruppa per roundLabel
        groupKey = match.roundLabel || 'Supercoppa';
      } else {
        // Per il campionato, usa matchday
        groupKey = match.matchday || 'N/A';
      }
      
      if (!grouped[groupKey]) {
        grouped[groupKey] = [];
      }
      grouped[groupKey].push(match);
    });
    
    // Ordina le giornate/round
    const sortedKeys = Object.keys(grouped).sort((a, b) => {
      // Ordine speciale per supercoppa
      const supercoppaOrder = ['Quarti di finale', 'Semifinali', 'Finale'];
      const aIndex = supercoppaOrder.indexOf(a);
      const bIndex = supercoppaOrder.indexOf(b);
      
      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }
      if (aIndex !== -1) return 1; // Supercoppa dopo campionato
      if (bIndex !== -1) return -1;
      
      // Per il campionato, ordina numericamente
      if (a === 'N/A') return 1;
      if (b === 'N/A') return -1;
      return parseInt(a) - parseInt(b);
    });
    
    const result = {};
    sortedKeys.forEach(key => {
      result[key] = grouped[key];
    });
    
    const resultKeys = Object.keys(result);
    console.log(`[LOG] ✅ matchesByMatchday calcolato: ${resultKeys.length} giornate/round`);
    return result;
  }, [matches]);

  // Crea un log degli accoppiamenti per giocatore
  const playerPairings = useMemo(() => {
    console.log('[LOG] 🔄 Calcolo playerPairings...');
    const pairings = {};
    
    // Inizializza tutti i giocatori
    players.forEach(player => {
      pairings[player.id] = {
        name: player.name,
        pairings: []
      };
    });
    
    // Analizza le partite per trovare gli accoppiamenti
    Object.entries(matchesByMatchday).forEach(([matchday, matchList]) => {
      matchList.forEach(match => {
        const teamA = normalizeTeam(match.teamA);
        const teamB = normalizeTeam(match.teamB);
        
        // Aggiungi accoppiamento per team A
        if (teamA.a.id && teamA.b.id) {
          if (!pairings[teamA.a.id]) pairings[teamA.a.id] = { name: teamA.a.name, pairings: [] };
          if (!pairings[teamA.b.id]) pairings[teamA.b.id] = { name: teamA.b.name, pairings: [] };
          
          pairings[teamA.a.id].pairings.push({
            matchday: parseInt(matchday),
            partner: teamA.b.name,
            partnerId: teamA.b.id,
            opponent: teamLabel(match.teamB, players, standings, match),
            status: match.status,
            matchId: match.id
          });
          
          pairings[teamA.b.id].pairings.push({
            matchday: parseInt(matchday),
            partner: teamA.a.name,
            partnerId: teamA.a.id,
            opponent: teamLabel(match.teamB, players, standings, match),
            status: match.status,
            matchId: match.id
          });
        }
        
        // Aggiungi accoppiamento per team B
        if (teamB.a.id && teamB.b.id) {
          if (!pairings[teamB.a.id]) pairings[teamB.a.id] = { name: teamB.a.name, pairings: [] };
          if (!pairings[teamB.b.id]) pairings[teamB.b.id] = { name: teamB.b.name, pairings: [] };
          
          pairings[teamB.a.id].pairings.push({
            matchday: parseInt(matchday),
            partner: teamB.b.name,
            partnerId: teamB.b.id,
            opponent: teamLabel(match.teamA, players, standings, match),
            status: match.status,
            matchId: match.id
          });
          
          pairings[teamB.b.id].pairings.push({
            matchday: parseInt(matchday),
            partner: teamB.a.name,
            partnerId: teamB.a.id,
            opponent: teamLabel(match.teamA, players, standings, match),
            status: match.status,
            matchId: match.id
          });
        }
      });
    });
    
    // Ordina gli accoppiamenti per giornata
    Object.values(pairings).forEach(player => {
      player.pairings.sort((a, b) => a.matchday - b.matchday);
    });
    
    const playersWithPairings = Object.keys(pairings).filter(k => pairings[k].pairings.length > 0).length;
    console.log(`[LOG] ✅ playerPairings calcolato: ${playersWithPairings} giocatori con accoppiamenti`);
    return pairings;
  }, [matchesByMatchday, players, standings]);

  // Analizza accoppiamenti ripetuti (stesso partner più volte)
  const repeatedPairings = useMemo(() => {
    const repeated = [];
    
    Object.entries(playerPairings).forEach(([playerId, player]) => {
      const partnerCounts = {};
      
      // Conta quante volte ogni giocatore ha giocato con ogni partner
      player.pairings.forEach(pairing => {
        const partnerId = pairing.partnerId;
        if (!partnerCounts[partnerId]) {
          partnerCounts[partnerId] = {
            partnerName: pairing.partner,
            count: 0,
            matchdays: []
          };
        }
        partnerCounts[partnerId].count++;
        partnerCounts[partnerId].matchdays.push(pairing.matchday);
      });
      
      // Trova i partner con cui ha giocato più di una volta
      Object.entries(partnerCounts).forEach(([partnerId, data]) => {
        if (data.count > 1) {
          repeated.push({
            playerId,
            playerName: player.name,
            partnerId,
            partnerName: data.partnerName,
            count: data.count,
            matchdays: data.matchdays.sort((a, b) => a - b)
          });
        }
      });
    });
    
    return repeated;
  }, [playerPairings]);

  // Statistiche generali
  const stats = useMemo(() => {
    const totalMatches = matches.length;
    const completedMatches = matches.filter(m => m.status === 'completed').length;
    const confirmedMatches = matches.filter(m => m.status === 'confirmed').length;
    const scheduledMatches = matches.filter(m => m.status === 'scheduled').length;
    const recoveryMatches = matches.filter(m => m.status === 'da recuperare').length;
    
    const totalMatchdays = Object.keys(matchesByMatchday).length;
    const playersWithoutMatches = players.filter(player => !playerPairings[player.id] || playerPairings[player.id].pairings.length === 0).length;
    
    return {
      totalMatches,
      completedMatches,
      confirmedMatches,
      scheduledMatches,
      recoveryMatches,
      totalMatchdays,
      playersWithoutMatches,
      repeatedPairingsCount: repeatedPairings.length
    };
  }, [matches, matchesByMatchday, players, playerPairings, repeatedPairings]);

  if (loading) {
    console.log('[LOG] ⏳ Rendering stato loading...');
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4"></div>
          <p className="text-emerald-800 font-medium">Caricamento log...</p>
        </div>
      </div>
    );
  }
  
  console.log('[LOG] 🎨 Rendering pagina log con:', {
    matches: matches.length,
    players: players.length,
    standings: standings.length,
    pairCalendar: pairCalendar?.length || 0,
    matchesByMatchdayKeys: Object.keys(matchesByMatchday).length,
    playerPairingsKeys: Object.keys(playerPairings).length
  });

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 text-xl mb-4">❌</div>
          <p className="text-red-800 font-medium">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-7xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-emerald-900">📊 Log Torneo v2</h1>
        <button
          onClick={() => {
            fetchMatches();
            fetchPlayers();
          }}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
        >
          🔄 Aggiorna
        </button>
      </div>

      {/* Statistiche generali */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        <div className="bg-white rounded-lg p-4 shadow-sm border">
          <div className="text-2xl font-bold text-blue-600">{stats.totalMatchdays}</div>
          <div className="text-sm text-gray-600">Giornate</div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border">
          <div className="text-2xl font-bold text-gray-600">{stats.totalMatches}</div>
          <div className="text-sm text-gray-600">Partite Totali</div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border">
          <div className="text-2xl font-bold text-green-600">{stats.completedMatches}</div>
          <div className="text-sm text-gray-600">Completate</div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border">
          <div className="text-2xl font-bold text-yellow-600">{stats.confirmedMatches}</div>
          <div className="text-sm text-gray-600">Confermate</div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border">
          <div className="text-2xl font-bold text-blue-600">{stats.scheduledMatches}</div>
          <div className="text-sm text-gray-600">Programmate</div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border">
          <div className="text-2xl font-bold text-red-600">{stats.recoveryMatches}</div>
          <div className="text-sm text-gray-600">Da recuperare</div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border">
          <div className="text-2xl font-bold text-orange-600">{stats.playersWithoutMatches}</div>
          <div className="text-sm text-gray-600">Senza Partite</div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border">
          <div className="text-2xl font-bold text-purple-600">{stats.repeatedPairingsCount}</div>
          <div className="text-sm text-gray-600">Accoppiamenti Ripetuti</div>
        </div>
      </div>

      {/* Calendario Coppie Predefinite */}
      {pairCalendar && pairCalendar.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <h2 className="text-lg font-semibold text-emerald-800 mb-3">📅 Calendario Coppie Predefinite (15 Giornate)</h2>
          <p className="text-sm text-gray-600 mb-4">
            Le coppie sono predefinite per ogni giornata. Gli incontri (avversari) vengono generati dinamicamente dall'algoritmo di accoppiamento.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {pairCalendar.map((day, index) => (
              <div key={index} className="border rounded-lg p-3 bg-gray-50 hover:bg-gray-100 transition-colors">
                <h3 className="font-semibold text-gray-800 mb-2 text-sm border-b pb-1">
                  Giornata {day.day || index + 1}
                </h3>
                <div className="space-y-1.5">
                  {day.pairs && day.pairs.length > 0 ? (
                    day.pairs.map((pair, pairIndex) => {
                      let playerNames = [];
                      if (Array.isArray(pair.teamA)) {
                        playerNames = pair.teamA.map(p => p.name || p.Nome || p.id || '??');
                      } else if (pair.teamA) {
                        playerNames = [pair.teamA];
                      }

                      return (
                        <div key={pairIndex} className="text-xs py-1 px-2 bg-blue-50 rounded border border-blue-200">
                          <div className="font-medium text-blue-700">
                            {playerNames.length > 0 ? playerNames.join(' + ') : 'Coppia ' + (pairIndex + 1)}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-xs text-gray-500 italic">Nessuna coppia definita</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Elenco giornate e match */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-emerald-800">📅 Giornate e Partite</h2>
          {(() => {
            const entries = Object.entries(matchesByMatchday);
            console.log('[LOG] 🎨 Rendering sezione "Giornate e Partite":', {
              entriesCount: entries.length,
              entries: entries.map(([k, v]) => ({ key: k, matches: v.length }))
            });
            return null;
          })()}
          
          {Object.entries(matchesByMatchday).map(([matchday, matchList]) => (
            <div key={matchday} className="bg-white rounded-lg shadow-sm border overflow-hidden">
              <div className="bg-emerald-50 px-4 py-3 border-b">
                <h3 className="font-semibold text-emerald-900">
                  {matchday.includes('Giornata') ? matchday : matchday}
                  <span className="ml-2 text-sm font-normal text-emerald-700">
                    ({matchList.length} partite)
                  </span>
                </h3>
              </div>
              
              <div className="p-4 space-y-3">
                {matchList.map((match) => (
                  <div key={match.id} className="border rounded-lg p-3 bg-gray-50">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium text-sm">
                        {teamLabel(match.teamA, players, standings, match)} vs {teamLabel(match.teamB, players, standings, match)}
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(match.status)}`}>
                        {getStatusIcon(match.status)} {match.status}
                      </span>
                    </div>
                    {(() => {
                      const teamA = normalizeTeam(match.teamA);
                      const teamB = normalizeTeam(match.teamB);
                      
                      let scoreA, scoreB;
                      
                      // PRIORITÀ: Usa i punteggi al momento della generazione se disponibili
                      if (match.generationPoints) {
                        scoreA = match.generationPoints.teamA.total;
                        scoreB = match.generationPoints.teamB.total;
                      } else {
                        // Fallback: usa i punteggi dalla classifica attuale
                        const standingA1 = standings.find(s => s.playerId === teamA.a.id);
                        const standingA2 = standings.find(s => s.playerId === teamA.b.id);
                        const standingB1 = standings.find(s => s.playerId === teamB.a.id);
                        const standingB2 = standings.find(s => s.playerId === teamB.b.id);
                        
                        scoreA = (standingA1?.points || 0) + (standingA2?.points || 0);
                        scoreB = (standingB1?.points || 0) + (standingB2?.points || 0);
                      }
                      
                      const diff = Math.abs(scoreA - scoreB);
                      
                      return (
                        <div className="text-xs text-gray-600">
                          Differenza punteggi: {diff} {diff <= 1 ? '✅' : diff <= 3 ? '⚠️' : '❌'}
                        </div>
                      );
                    })()}
                    
                    <div className="text-xs text-gray-600 space-y-1">
                      {match.phase && (
                        <div>Fase: <span className="font-medium">{match.phase}</span></div>
                      )}
                      {match.date && (
                        <div>Data: <span className="font-medium">{match.date}</span></div>
                      )}
                      {match.time && (
                        <div>Ora: <span className="font-medium">{match.time}</span></div>
                      )}
                      {match.place && (
                        <div>Luogo: <span className="font-medium">{match.place}</span></div>
                      )}
                      {match.scoreA !== undefined && match.scoreB !== undefined && (
                        <div className="font-medium text-emerald-700">
                          Risultato: {match.scoreA} - {match.scoreB}
                        </div>
                      )}
                      {match.set1Games && match.set2Games && match.set3Games && (
                        <div className="text-xs">
                          <span className="font-medium">Game per set:</span> 
                          <span className="ml-1">
                            Set1: {match.set1Games.teamA}-{match.set1Games.teamB} | 
                            Set2: {match.set2Games.teamA}-{match.set2Games.teamB} | 
                            Set3: {match.set3Games.teamA}-{match.set3Games.teamB}
                          </span>
                        </div>
                      )}
                      {match.totalGamesA !== undefined && match.totalGamesB !== undefined && (
                        <div>
                          Game totali: <span className="font-medium">{match.totalGamesA}-{match.totalGamesB}</span>
                        </div>
                      )}
                    </div>
                    
                    {/* Bottone Modifica */}
                    <div className="mt-3 flex justify-end">
                      <button
                        onClick={() => openEditModal(match)}
                        className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
                      >
                        ✏️ Modifica
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Accoppiamenti per giocatore */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-emerald-800">👥 Accoppiamenti per Giocatore</h2>
          {(() => {
            const entries = Object.entries(playerPairings).filter(([_, player]) => player.pairings.length > 0);
            console.log('[LOG] 🎨 Rendering sezione "Accoppiamenti per Giocatore":', {
              playersWithPairings: entries.length,
              totalPlayers: Object.keys(playerPairings).length
            });
            return null;
          })()}
          
          {Object.entries(playerPairings)
            .filter(([_, player]) => player.pairings.length > 0)
            .sort(([_, a], [__, b]) => a.name.localeCompare(b.name))
            .map(([playerId, player]) => (
            <div key={playerId} className="bg-white rounded-lg shadow-sm border overflow-hidden">
              <div className="bg-blue-50 px-4 py-3 border-b">
                <h3 className="font-semibold text-blue-900">
                  {player.name}
                  <span className="ml-2 text-sm font-normal text-blue-700">
                    ({player.pairings.length} partite)
                  </span>
                </h3>
              </div>
              
              <div className="p-4 space-y-2">
                {player.pairings.map((pairing, index) => (
                  <div key={index} className="border rounded-lg p-3 bg-gray-50">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium text-sm">
                        Giornata {pairing.matchday}
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(pairing.status)}`}>
                        {getStatusIcon(pairing.status)}
                      </span>
                    </div>
                    
                    <div className="text-xs text-gray-600 space-y-1">
                      <div>
                        <span className="font-medium">Compagno:</span> {pairing.partner}
                      </div>
                      <div>
                        <span className="font-medium">Avversari:</span> {pairing.opponent}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Problemi di accoppiamento */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-xl font-semibold text-emerald-800 mb-4">⚠️ Analisi Problemi</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Giocatori senza partite */}
          <div>
            <h3 className="font-medium text-orange-800 mb-2">Giocatori senza partite</h3>
            {players.filter(player => !playerPairings[player.id] || playerPairings[player.id].pairings.length === 0).length > 0 ? (
              <div className="space-y-1">
                {players
                  .filter(player => !playerPairings[player.id] || playerPairings[player.id].pairings.length === 0)
                  .map(player => (
                    <div key={player.id} className="text-sm text-orange-700 bg-orange-50 p-2 rounded">
                      ⚠️ {player.name}
                    </div>
                  ))}
              </div>
            ) : (
              <div className="text-sm text-green-700 bg-green-50 p-2 rounded">
                ✅ Tutti i giocatori hanno partite
              </div>
            )}
          </div>

          {/* Partite da recuperare */}
          <div>
            <h3 className="font-medium text-red-800 mb-2">Partite da recuperare</h3>
            {stats.recoveryMatches > 0 ? (
              <div className="text-sm text-red-700 bg-red-50 p-2 rounded">
                ⚠️ {stats.recoveryMatches} partite da recuperare
              </div>
            ) : (
              <div className="text-sm text-green-700 bg-green-50 p-2 rounded">
                ✅ Nessuna partita da recuperare
              </div>
            )}
          </div>

          {/* Accoppiamenti ripetuti */}
          <div>
            <h3 className="font-medium text-purple-800 mb-2">Accoppiamenti ripetuti</h3>
            {repeatedPairings.length > 0 ? (
              <div className="space-y-1">
                {repeatedPairings.map((pairing, index) => (
                  <div key={index} className="text-sm text-purple-700 bg-purple-50 p-2 rounded">
                    <div className="font-medium">
                      🔄 {pairing.playerName} + {pairing.partnerName}
                    </div>
                    <div className="text-xs text-purple-600">
                      Giocato insieme {pairing.count} volte (Giornate: {pairing.matchdays.join(', ')})
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-green-700 bg-green-50 p-2 rounded">
                ✅ Nessun accoppiamento ripetuto
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Modal di modifica partita */}
      {editingMatch && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Modifica Partita</h2>
                <button
                  onClick={closeEditModal}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>
              
              <div className="space-y-4">
                {/* Squadre */}
                <div className="bg-gray-50 p-3 rounded">
                  <h3 className="font-medium mb-2">Squadre</h3>
                  <div className="text-sm">
                    {teamLabel(editingMatch.teamA, players, standings, editingMatch)} vs {teamLabel(editingMatch.teamB, players, standings, editingMatch)}
                  </div>
                </div>
                
                {/* Dettagli partita */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Luogo</label>
                    <input
                      type="text"
                      value={editForm.place}
                      onChange={(e) => setEditForm(prev => ({ ...prev, place: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Campo 1, Campo 2, etc."
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Data</label>
                    <input
                      type="date"
                      value={editForm.date}
                      onChange={(e) => setEditForm(prev => ({ ...prev, date: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Ora</label>
                    <input
                      type="time"
                      value={editForm.time}
                      onChange={(e) => setEditForm(prev => ({ ...prev, time: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Status</label>
                    <div className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-600">
                      Completed (automatico)
                    </div>
                  </div>
                </div>
                
                {/* Risultati */}
                <div className="border-t pt-4">
                  <h3 className="font-medium mb-3">Risultati</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Punteggio Squadra A</label>
                      <input
                        type="number"
                        min="0"
                        max="3"
                        value={editForm.scoreA}
                        onChange={(e) => setEditForm(prev => ({ ...prev, scoreA: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="0-3"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-1">Punteggio Squadra B</label>
                      <input
                        type="number"
                        min="0"
                        max="3"
                        value={editForm.scoreB}
                        onChange={(e) => setEditForm(prev => ({ ...prev, scoreB: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="0-3"
                      />
                    </div>
                  </div>
                </div>
                
                {/* Game totali - Calcolati automaticamente */}
                <div className="border-t pt-4">
                  <h3 className="font-medium mb-3">Game Totali (Calcolati automaticamente)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-600">Game Squadra A</label>
                      <div className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-600">
                        {(() => {
                          const set1A = parseInt(editForm.set1Games.teamA) || 0;
                          const set2A = parseInt(editForm.set2Games.teamA) || 0;
                          const set3A = parseInt(editForm.set3Games.teamA) || 0;
                          return set1A + set2A + set3A;
                        })()}
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-600">Game Squadra B</label>
                      <div className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-600">
                        {(() => {
                          const set1B = parseInt(editForm.set1Games.teamB) || 0;
                          const set2B = parseInt(editForm.set2Games.teamB) || 0;
                          const set3B = parseInt(editForm.set3Games.teamB) || 0;
                          return set1B + set2B + set3B;
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Game per set */}
                <div className="border-t pt-4">
                  <h3 className="font-medium mb-3">Game per Set</h3>
                  <div className="space-y-3">
                    {/* Set 1 */}
                    <div>
                      <label className="block text-sm font-medium mb-1">Set 1</label>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          min="0"
                          max="7"
                          value={editForm.set1Games.teamA}
                          onChange={(e) => setEditForm(prev => ({ 
                            ...prev, 
                            set1Games: { ...prev.set1Games, teamA: e.target.value }
                          }))}
                          className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="A"
                        />
                        <input
                          type="number"
                          min="0"
                          max="7"
                          value={editForm.set1Games.teamB}
                          onChange={(e) => setEditForm(prev => ({ 
                            ...prev, 
                            set1Games: { ...prev.set1Games, teamB: e.target.value }
                          }))}
                          className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="B"
                        />
                      </div>
                    </div>
                    
                    {/* Set 2 */}
                    <div>
                      <label className="block text-sm font-medium mb-1">Set 2</label>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          min="0"
                          max="7"
                          value={editForm.set2Games.teamA}
                          onChange={(e) => setEditForm(prev => ({ 
                            ...prev, 
                            set2Games: { ...prev.set2Games, teamA: e.target.value }
                          }))}
                          className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="A"
                        />
                        <input
                          type="number"
                          min="0"
                          max="7"
                          value={editForm.set2Games.teamB}
                          onChange={(e) => setEditForm(prev => ({ 
                            ...prev, 
                            set2Games: { ...prev.set2Games, teamB: e.target.value }
                          }))}
                          className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="B"
                        />
                      </div>
                    </div>
                    
                    {/* Set 3 */}
                    <div>
                      <label className="block text-sm font-medium mb-1">Set 3</label>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          min="0"
                          max="7"
                          value={editForm.set3Games.teamA}
                          onChange={(e) => setEditForm(prev => ({ 
                            ...prev, 
                            set3Games: { ...prev.set3Games, teamA: e.target.value }
                          }))}
                          className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="A"
                        />
                        <input
                          type="number"
                          min="0"
                          max="7"
                          value={editForm.set3Games.teamB}
                          onChange={(e) => setEditForm(prev => ({ 
                            ...prev, 
                            set3Games: { ...prev.set3Games, teamB: e.target.value }
                          }))}
                          className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="B"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Bottoni */}
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                <button
                  onClick={closeEditModal}
                  disabled={saving}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50"
                >
                  Annulla
                </button>
                <button
                  onClick={saveMatchChanges}
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Salvataggio...' : 'Salva Modifiche'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
