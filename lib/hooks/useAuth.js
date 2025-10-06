// lib/hooks/useAuth.js
import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged 
} from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';

export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Memoizza le funzioni per evitare re-render inutili
  const login = useCallback(async (username, password) => {
    try {
      setError(null);
      setLoading(true);
      
      console.log('🔍 Tentativo login con username:', username);
      
      // Prova prima con il nuovo formato (username@dummy.com)
      const newEmail = `${username}@dummy.com`;
      console.log('📧 Tentativo con nuovo formato:', newEmail);
      
      try {
        await signInWithEmailAndPassword(auth, newEmail, password);
        console.log('✅ Login riuscito con nuovo formato');
        return;
      } catch (newFormatError) {
        console.log('❌ Login fallito con nuovo formato:', newFormatError.message);
        
        // Se fallisce, prova con il formato legacy (username@username.com)
        const legacyEmail = `${username}@${username}.com`;
        console.log('📧 Tentativo con formato legacy:', legacyEmail);
        
        try {
          await signInWithEmailAndPassword(auth, legacyEmail, password);
          console.log('✅ Login riuscito con formato legacy');
          return;
        } catch (legacyError) {
          console.log('❌ Login fallito anche con formato legacy:', legacyError.message);
          
          // Se entrambi falliscono, prova con l'username come email diretta
          console.log('📧 Tentativo con username come email diretta:', username);
          await signInWithEmailAndPassword(auth, username, password);
          console.log('✅ Login riuscito con username diretto');
        }
      }
    } catch (err) {
      console.error('❌ Tutti i tentativi di login falliti:', err);
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
        username: userData.username, // Aggiungi username al profilo
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

  // Gestione auth state con cleanup
  useEffect(() => {
    let mounted = true;
    let unsubscribe = null;

    const handleAuthStateChange = async (firebaseUser) => {
      if (!mounted) return;

      try {
        if (firebaseUser) {
          // Carica i dati del profilo utente
          const userDoc = await getDoc(doc(db, 'players', firebaseUser.uid));
          if (mounted) {
            if (userDoc.exists()) {
              const userData = userDoc.data();
              // Estrai username dall'email se non presente nel profilo
              const username = userData.username || firebaseUser.email?.split('@')[0] || 'unknown';
              setUser({ 
                id: firebaseUser.uid, 
                email: firebaseUser.email,
                username,
                ...userData 
              });
            } else {
              // Per utenti esistenti senza profilo, estrai username dall'email
              const username = firebaseUser.email?.split('@')[0] || 'unknown';
              setUser({ 
                id: firebaseUser.uid, 
                email: firebaseUser.email,
                username
              });
            }
          }
        } else {
          if (mounted) {
            setUser(null);
          }
        }
      } catch (err) {
        console.error('Errore caricamento profilo utente:', err);
        if (mounted && firebaseUser) {
          const username = firebaseUser.email?.split('@')[0] || 'unknown';
          setUser({ 
            id: firebaseUser.uid, 
            email: firebaseUser.email,
            username
          });
        }
      } finally {
        if (mounted) {
          setLoading(false);
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
    register,
    logout,
    isAuthenticated: !!user
  }), [user, loading, error, login, register, logout]);

  return authValue;
};
