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
    case 'incomplete': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
}

function getStatusIcon(status) {
  switch (status) {
    case 'completed': return '✅';
    case 'confirmed': return '⏳';
    case 'scheduled': return '📅';
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
      const matchesSnap = await getDocs(
        query(collection(db, "matches"), orderBy("createdAt", "desc"))
      );
      setMatches(matchesSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })));
    } catch (e) {
      console.error("Errore caricamento partite:", e);
      setError("Errore nel caricamento delle partite");
    }
  }, []);

  const fetchPlayers = useCallback(async () => {
    try {
      const playersSnap = await getDocs(collection(db, "players"));
      setPlayers(playersSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) })));
    } catch (e) {
      console.error("Errore caricamento giocatori:", e);
      setError("Errore nel caricamento dei giocatori");
    }
  }, []);

  const fetchStandings = useCallback(async () => {
    try {
      console.log('🔄 Caricando classifica per log page...');
      // Forza sempre il refresh per evitare cache stale
      const response = await fetch('/api/classifica?refresh=true');
      if (response.ok) {
        const data = await response.json();
        console.log('📊 Classifica caricata:', data);
        console.log('📈 Numero giocatori:', data.rows?.length || 0);
        console.log('🔄 Cache status:', data.cached ? 'CACHED' : 'FRESH');
        
        if (data.rows && data.rows.length > 0) {
          console.log('🎯 Primi 3 giocatori:', data.rows.slice(0, 3));
          // Controlla se ci sono giocatori con punteggi > 0
          const playersWithPoints = data.rows.filter(p => p.points > 0);
          if (playersWithPoints.length > 0) {
            console.log('⚠️ ATTENZIONE: Giocatori con punteggi > 0:', playersWithPoints);
            console.log('🎯 Esempi:', playersWithPoints.slice(0, 3));
          } else {
            console.log('✅ Tutti i giocatori hanno 0 punti');
          }
        }
        
        setStandings(data.rows || []);
      } else {
        console.error('❌ Errore response classifica:', response.status);
      }
    } catch (e) {
      console.error("❌ Errore caricamento classifica:", e);
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
      totalGamesA: match.totalGamesA !== undefined ? match.totalGamesA : '',
      totalGamesB: match.totalGamesB !== undefined ? match.totalGamesB : '',
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
      totalGamesA: '',
      totalGamesB: '',
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
          scoreA: editForm.scoreA ? parseInt(editForm.scoreA) : undefined,
          scoreB: editForm.scoreB ? parseInt(editForm.scoreB) : undefined,
          status: "completed", // Forza sempre completed quando si modifica dal log
          totalGamesA: editForm.totalGamesA ? parseInt(editForm.totalGamesA) : undefined,
          totalGamesB: editForm.totalGamesB ? parseInt(editForm.totalGamesB) : undefined,
          set1Games: {
            teamA: editForm.set1Games.teamA ? parseInt(editForm.set1Games.teamA) : undefined,
            teamB: editForm.set1Games.teamB ? parseInt(editForm.set1Games.teamB) : undefined
          },
          set2Games: {
            teamA: editForm.set2Games.teamA ? parseInt(editForm.set2Games.teamA) : undefined,
            teamB: editForm.set2Games.teamB ? parseInt(editForm.set2Games.teamB) : undefined
          },
          set3Games: {
            teamA: editForm.set3Games.teamA ? parseInt(editForm.set3Games.teamA) : undefined,
            teamB: editForm.set3Games.teamB ? parseInt(editForm.set3Games.teamB) : undefined
          }
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
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchMatches(), fetchPlayers(), fetchStandings()]);
      setLoading(false);
    };
    loadData();
  }, [fetchMatches, fetchPlayers, fetchStandings]);

  // Raggruppa le partite per giornata
  const matchesByMatchday = useMemo(() => {
    const grouped = {};
    matches.forEach(match => {
      const matchday = match.matchday || 'N/A';
      if (!grouped[matchday]) {
        grouped[matchday] = [];
      }
      grouped[matchday].push(match);
    });
    
    // Ordina le giornate numericamente
    const sortedMatchdays = Object.keys(grouped).sort((a, b) => {
      if (a === 'N/A') return 1;
      if (b === 'N/A') return -1;
      return parseInt(a) - parseInt(b);
    });
    
    const result = {};
    sortedMatchdays.forEach(matchday => {
      result[matchday] = grouped[matchday];
    });
    
    return result;
  }, [matches]);

  // Crea un log degli accoppiamenti per giocatore
  const playerPairings = useMemo(() => {
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
    
    return pairings;
  }, [matchesByMatchday, players]);

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
    const incompleteMatches = matches.filter(m => m.status === 'incomplete').length;
    
    const totalMatchdays = Object.keys(matchesByMatchday).length;
    const playersWithoutMatches = players.filter(player => !playerPairings[player.id] || playerPairings[player.id].pairings.length === 0).length;
    
    return {
      totalMatches,
      completedMatches,
      confirmedMatches,
      scheduledMatches,
      incompleteMatches,
      totalMatchdays,
      playersWithoutMatches,
      repeatedPairingsCount: repeatedPairings.length
    };
  }, [matches, matchesByMatchday, players, playerPairings, repeatedPairings]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4"></div>
          <p className="text-emerald-800 font-medium">Caricamento log...</p>
        </div>
      </div>
    );
  }

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
          <div className="text-2xl font-bold text-red-600">{stats.incompleteMatches}</div>
          <div className="text-sm text-gray-600">Incomplete</div>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Elenco giornate e match */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-emerald-800">📅 Giornate e Partite</h2>
          
          {Object.entries(matchesByMatchday).map(([matchday, matchList]) => (
            <div key={matchday} className="bg-white rounded-lg shadow-sm border overflow-hidden">
              <div className="bg-emerald-50 px-4 py-3 border-b">
                <h3 className="font-semibold text-emerald-900">
                  Giornata {matchday}
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

          {/* Partite incomplete */}
          <div>
            <h3 className="font-medium text-red-800 mb-2">Partite incomplete</h3>
            {stats.incompleteMatches > 0 ? (
              <div className="text-sm text-red-700 bg-red-50 p-2 rounded">
                ⚠️ {stats.incompleteMatches} partite incomplete
              </div>
            ) : (
              <div className="text-sm text-green-700 bg-green-50 p-2 rounded">
                ✅ Nessuna partita incomplete
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
                
                {/* Game totali */}
                <div className="border-t pt-4">
                  <h3 className="font-medium mb-3">Game Totali</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Game Squadra A</label>
                      <input
                        type="number"
                        min="0"
                        value={editForm.totalGamesA}
                        onChange={(e) => setEditForm(prev => ({ ...prev, totalGamesA: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="0"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-1">Game Squadra B</label>
                      <input
                        type="number"
                        min="0"
                        value={editForm.totalGamesB}
                        onChange={(e) => setEditForm(prev => ({ ...prev, totalGamesB: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="0"
                      />
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
