// lib/hooks/useFirestore.js
import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  updateDoc, 
  addDoc,
  query,
  orderBy,
  where,
  limit
} from 'firebase/firestore';
import { db } from '../firebase';

export const useFirestore = () => {
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [tournament, setTournament] = useState({
    phase: 'registration',
    settings: { maxPlayers: 20, pointsPerWin: 3, pointsPerLoss: 1 }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Memoizza le funzioni per evitare re-render inutili
  const savePlayer = useCallback(async (playerData) => {
    try {
      setError(null);
      if (playerData.id) {
        await updateDoc(doc(db, 'players', playerData.id), {
          ...playerData,
          updatedAt: new Date().toISOString()
        });
      } else {
        await addDoc(collection(db, 'players'), {
          ...playerData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
    } catch (err) {
      setError(err?.message || 'Errore salvataggio giocatore');
      throw err;
    }
  }, []);

  const saveMatch = useCallback(async (matchData) => {
    try {
      setError(null);
      if (matchData.id) {
        await setDoc(doc(db, 'matches', String(matchData.id)), {
          ...matchData,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } else {
        await addDoc(collection(db, 'matches'), {
          ...matchData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
    } catch (err) {
      setError(err?.message || 'Errore salvataggio partita');
      throw err;
    }
  }, []);

  const updateTournament = useCallback(async (tournamentData) => {
    try {
      setError(null);
      await setDoc(doc(db, 'tournament', 'settings'), {
        ...tournamentData,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (err) {
      setError(err?.message || 'Errore aggiornamento torneo');
      throw err;
    }
  }, []);

  // Gestione subscription con cleanup e ottimizzazioni
  useEffect(() => {
    let mounted = true;
    const unsubscribers = [];

    const setupSubscriptions = () => {
      try {
        // Subscription per i giocatori con ordinamento
        const playersQuery = query(
          collection(db, 'players'), 
          orderBy('points', 'desc'),
          limit(100) // Limita per performance
        );
        
        const unsubscribePlayers = onSnapshot(
          playersQuery,
          (snapshot) => {
            if (!mounted) return;
            
            const playersData = snapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            }));
            setPlayers(playersData);
          },
          (err) => {
            console.error('Errore subscription giocatori:', err);
            if (mounted) {
              setError(err?.message || 'Errore caricamento giocatori');
            }
          }
        );
        unsubscribers.push(unsubscribePlayers);

        // Subscription per le partite
        const matchesQuery = query(
          collection(db, 'matches'),
          orderBy('createdAt', 'desc'),
          limit(200) // Limita per performance
        );
        
        const unsubscribeMatches = onSnapshot(
          matchesQuery,
          (snapshot) => {
            if (!mounted) return;
            
            const matchesData = snapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            }));
            setMatches(matchesData);
          },
          (err) => {
            console.error('Errore subscription partite:', err);
            if (mounted) {
              setError(err?.message || 'Errore caricamento partite');
            }
          }
        );
        unsubscribers.push(unsubscribeMatches);

        // Subscription per le impostazioni del torneo
        const unsubscribeTournament = onSnapshot(
          doc(db, 'tournament', 'settings'),
          (docSnap) => {
            if (!mounted) return;
            
            if (docSnap.exists()) {
              setTournament(docSnap.data());
            }
          },
          (err) => {
            console.error('Errore subscription torneo:', err);
            if (mounted) {
              setError(err?.message || 'Errore caricamento torneo');
            }
          }
        );
        unsubscribers.push(unsubscribeTournament);

        // Imposta loading a false dopo aver stabilito le subscription
        setLoading(false);
      } catch (err) {
        console.error('Errore setup subscription:', err);
        if (mounted) {
          setError(err?.message || 'Errore inizializzazione');
          setLoading(false);
        }
      }
    };

    setupSubscriptions();

    return () => {
      mounted = false;
      // Cleanup di tutte le subscription
      unsubscribers.forEach(unsub => {
        if (typeof unsub === 'function') {
          unsub();
        }
      });
    };
  }, []);

  // Memoizza i valori calcolati per evitare re-render
  const computedValues = useMemo(() => {
    const activeMatches = matches.filter(m => 
      m.status === 'scheduled' || m.status === 'confirmed'
    );
    
    const completedMatches = matches.filter(m => 
      m.status === 'completed'
    );

    const topPlayers = players.slice(0, 10);

    return {
      activeMatches,
      completedMatches,
      topPlayers,
      totalPlayers: players.length,
      totalMatches: matches.length
    };
  }, [players, matches]);

  // Memoizza il valore di ritorno per evitare re-render
  const firestoreValue = useMemo(() => ({
    players,
    matches,
    tournament,
    loading,
    error,
    savePlayer,
    saveMatch,
    updateTournament,
    ...computedValues
  }), [
    players, 
    matches, 
    tournament, 
    loading, 
    error, 
    savePlayer, 
    saveMatch, 
    updateTournament,
    computedValues
  ]);

  return firestoreValue;
};
