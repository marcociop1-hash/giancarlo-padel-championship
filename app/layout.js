"use client";

import "./globals.css";
import { useEffect, useState, useCallback, memo } from "react";
import { auth } from "../lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";

// Lista degli admin autorizzati
const ADMIN_EMAILS = [
  "test44@test44.com", // Sostituisci con l'email dell'admin
  "admin@example.com",     // Aggiungi altre email admin se necessario
];

// Funzione per determinare se un utente è admin
const isUserAdmin = (user) => {
  if (!user || !user.email) return false;
  return ADMIN_EMAILS.includes(user.email.toLowerCase());
};

const RootLayout = memo(({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (mounted) {
        setUser(u || null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Errore logout:", err);
    }
  }, []);

  if (loading) {
    return (
      <html lang="it">
        <body>
          <div className="min-h-dvh bg-padel-gradient flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4"></div>
              <p className="text-emerald-800 font-medium">Caricamento...</p>
            </div>
          </div>
        </body>
      </html>
    );
  }

  return (
    <html lang="it">
      <body>
        {/* SFONDO GRADIENTE "STYLE PRECEDENTE" */}
        <div className="min-h-dvh bg-padel-gradient flex flex-col">
          {/* TOP BAR */}
          <header className="w-full border-b bg-white/80 backdrop-blur-sm">
            <div className="mx-auto max-w-7xl flex h-14 items-center justify-between px-4">
              <div className="flex items-center gap-2 font-semibold text-emerald-900">
                🎾 Giancarlo Padel Championship
              </div>
              
              {/* NAVIGAZIONE - Solo per admin */}
              {user && isUserAdmin(user) && (
                <nav className="flex items-center gap-4">
                  <a 
                    href="/" 
                    className="text-sm text-gray-700 hover:text-emerald-600 transition-colors"
                  >
                    Home
                  </a>
                  <a 
                    href="/classifica" 
                    className="text-sm text-gray-700 hover:text-emerald-600 transition-colors"
                  >
                    Classifica
                  </a>
                  <a 
                    href="/supercoppa" 
                    className="text-sm text-gray-700 hover:text-emerald-600 transition-colors"
                  >
                    Supercoppa
                  </a>
                  <a 
                    href="/admin" 
                    className="text-sm text-gray-700 hover:text-emerald-600 transition-colors"
                  >
                    Admin
                  </a>
                </nav>
              )}
              
              {user ? (
                <div className="flex items-center gap-2">
                  <span className="hidden text-sm text-gray-700 sm:block">
                    {user.email}
                  </span>
                  <button
                    onClick={handleLogout}
                    className="rounded-md bg-gray-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
                  >
                    Logout
                  </button>
                </div>
              ) : null}
            </div>
          </header>

          {/* CONTENUTO */}
          <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-6">
            {children}
          </main>

          {/* FOOTER */}
          <footer className="w-full border-t bg-white/80 backdrop-blur-sm">
            <div className="mx-auto max-w-7xl px-4 py-4">
              <div className="text-center text-sm text-gray-600">
                © 2024 Giancarlo Padel Championship. Tutti i diritti riservati.
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
});

RootLayout.displayName = 'RootLayout';

export default RootLayout;
