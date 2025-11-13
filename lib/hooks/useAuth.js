// lib/hooks/useAuth.js
import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { auth } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Memoizza le funzioni per evitare re-render inutili
  const login = useCallback(async (email, password) => {
    try {
      setError(null);
      setLoading(true);
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError(err?.message || 'Errore di accesso');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const loginWithUsername = useCallback(async (username, password) => {
    try {
      setError(null);
      setLoading(true);
      
      // Chiama l'API per login con username
      const response = await fetch('/api/auth/login-username', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Errore di accesso');
      }
      
      // L'API restituisce l'email associata all'username
      // Ora usiamo Firebase Auth con email + password
      await signInWithEmailAndPassword(auth, data.user.email, password);
      
    } catch (err) {
      setError(err?.message || 'Errore di accesso');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (email, password, userData) => {
    try {
      setError(null);
      setLoading(true);
      
      const { user: firebaseUser } = await createUserWithEmailAndPassword(auth, email, password);
      
      const userProfile = {
        ...userData,
        email,
        points: 0,
        wins: 0,
        losses: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      await setDoc(doc(db, 'players', firebaseUser.uid), userProfile);
      setUser({ id: firebaseUser.uid, ...userProfile });
    } catch (err) {
      setError(err?.message || 'Errore di registrazione');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      setError(null);
      await signOut(auth);
    } catch (err) {
      setError(err?.message || 'Errore di logout');
      throw err;
    }
  }, []);


  // Gestione auth state con cleanup - usa API server-side per il profilo
  useEffect(() => {
    let mounted = true;
    let unsubscribe = null;

    const handleAuthStateChange = async (firebaseUser) => {
      if (!mounted) return;

      try {
        if (firebaseUser) {
          // Imposta subito l'utente base (senza attendere Firestore) per render veloce
          setUser({ 
            id: firebaseUser.uid, 
            email: firebaseUser.email
          });
          setLoading(false);
          
          // Carica i dati del profilo in background via API (non blocca il rendering)
          try {
            // Ottieni il token ID per l'autenticazione
            const idToken = await firebaseUser.getIdToken();
            
            const response = await fetch('/api/profile/get', {
              headers: {
                'Authorization': `Bearer ${idToken}`
              }
            });
            
            if (mounted && response.ok) {
              const data = await response.json();
              if (data.user) {
                setUser(data.user);
              }
            }
          } catch (apiErr) {
            // Se l'API fallisce, usa i dati base già impostati
            console.error('Errore caricamento profilo via API:', apiErr);
            if (mounted) {
              const username = firebaseUser.email?.split('@')[0] || 'unknown';
              setUser(prev => ({ 
                ...prev,
                username
              }));
            }
          }
        } else {
          if (mounted) {
            setUser(null);
            setLoading(false);
          }
        }
      } catch (err) {
        console.error('Errore gestione auth state:', err);
        if (mounted) {
          setLoading(false);
          if (firebaseUser) {
            const username = firebaseUser.email?.split('@')[0] || 'unknown';
            setUser({ 
              id: firebaseUser.uid, 
              email: firebaseUser.email,
              username
            });
          }
        }
      }
    };

    unsubscribe = onAuthStateChanged(auth, handleAuthStateChange);

    return () => {
      mounted = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  // Memoizza il valore di ritorno per evitare re-render
  const authValue = useMemo(() => ({
    user,
    loading,
    error,
    login,
    loginWithUsername,
    register,
    logout,
    isAuthenticated: !!user
  }), [user, loading, error, login, loginWithUsername, register, logout]);

  return authValue;
};
