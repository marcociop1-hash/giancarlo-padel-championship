"use client";

import "./globals.css";
import { useEffect, useState, useCallback, memo } from "react";
import { auth } from "../lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { isUserAdmin } from "../lib/admin";

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
            <div className="mx-auto max-w-7xl flex h-14 items-center justify-between px-3 sm:px-4">
              <div className="flex items-center gap-2 font-semibold text-emerald-900 min-w-0">
                <span className="text-lg sm:text-xl">🎾</span>
                <div className="hidden sm:block">
                  <span className="text-sm sm:text-base">Giancarlo Padel Championship</span>
                </div>
                <div className="sm:hidden text-xs">
                  <div className="leading-tight">Giancarlo</div>
                  <div className="leading-tight">Padel</div>
                </div>
              </div>
              
              {/* NAVIGAZIONE - Solo per admin */}
              {user && isUserAdmin(user) && (
                <nav className="flex items-center gap-1 sm:gap-2 md:gap-4 flex-wrap">
                  <a 
                    href="/" 
                    className="text-xs sm:text-sm text-gray-700 hover:text-emerald-600 transition-colors px-1 py-1 rounded hover:bg-gray-100"
                  >
                    Home
                  </a>
                  <a 
                    href="/classifica" 
                    className="text-xs sm:text-sm text-gray-700 hover:text-emerald-600 transition-colors px-1 py-1 rounded hover:bg-gray-100"
                  >
                    Classifica
                  </a>
                  <a 
                    href="/supercoppa" 
                    className="text-xs sm:text-sm text-gray-700 hover:text-emerald-600 transition-colors px-1 py-1 rounded hover:bg-gray-100"
                  >
                    Supercoppa
                  </a>
                  <a 
                    href="/admin" 
                    className="text-xs sm:text-sm text-gray-700 hover:text-emerald-600 transition-colors px-1 py-1 rounded hover:bg-gray-100"
                  >
                    Admin
                  </a>
                  <a 
                    href="/admin/log" 
                    className="text-xs sm:text-sm text-gray-700 hover:text-emerald-600 transition-colors px-1 py-1 rounded hover:bg-gray-100"
                  >
                    Log
                  </a>
                </nav>
              )}
              
              {user && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="hidden text-sm text-gray-700 sm:block">
                    {user.email}
                  </span>
                  <button
                    onClick={handleLogout}
                    className="rounded-md bg-gray-700 px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium text-white hover:bg-gray-800 transition-colors whitespace-nowrap"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </header>

          {/* CONTENUTO */}
          <main className="flex-1 mx-auto w-full max-w-7xl px-3 sm:px-4 py-4 sm:py-6">
            {children}
          </main>

          {/* FOOTER */}
          <footer className="text-center py-4 text-gray-600 text-sm">
            © 2025 NicoProgrammer. Tutti i diritti riservati.
          </footer>
        </div>
      </body>
    </html>
  );
});

RootLayout.displayName = 'RootLayout';

export default RootLayout;
