'use client';

import { useState, useCallback, memo } from 'react';
import LoginForm from '../components/LoginForm';
import LoadingSpinner from '../components/LoadingSpinner';
import PadelTournamentApp from '../components/PadelTournamentApp';
import { useAuth } from '../lib/hooks/useAuth';

const Home = memo(() => {
  const { user, loading, error: authError, login, register, logout } = useAuth();
  const [uiLoading, setUiLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = useCallback(async (email, password) => {
    try {
      setError(''); 
      setUiLoading(true);
      await login(email, password);
    } catch (e) {
      setError(e?.message || 'Errore di accesso');
    } finally {
      setUiLoading(false);
    }
  }, [login]);

  const handleRegister = useCallback(async (email, password, userData) => {
    try {
      setError(''); 
      setUiLoading(true);
      await register(email, password, userData);
    } catch (e) {
      setError(e?.message || 'Errore di registrazione');
    } finally {
      setUiLoading(false);
    }
  }, [register]);

  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } catch (e) {
      console.error('Errore logout:', e);
    }
  }, [logout]);

  // Mostra errori di autenticazione o UI
  const displayError = authError || error;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100">
        <LoadingSpinner 
          size="lg" 
          text="Caricamento applicazione..." 
          className="min-h-screen"
        />
      </div>
    );
  }

  return user ? (
    <PadelTournamentApp user={user} onLogout={handleLogout} />
  ) : (
    <LoginForm
      onLogin={handleLogin}
      onRegister={handleRegister}
      error={displayError}
      loading={uiLoading}
    />
  );
});

Home.displayName = 'Home';

export default Home;
