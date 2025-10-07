"use client";

import { useEffect, useState, useMemo, memo } from "react";
import { db } from "../../lib/firebase";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { formatDate, formatTime } from "../../lib/utils";
import TournamentBracket from "../../components/TournamentBracket";
import SupercoppaWinnerBanner from "../../components/SupercoppaWinnerBanner";
import SupercoppaCompletedBanner from "../../components/SupercoppaCompletedBanner";

// Tipi per la supercoppa
type Match = {
  id: string;
  phase: string;
  round: number;
  roundLabel: string;
  matchNumber: number;
  status: string;
  teamA: any[];
  teamB: any[];
  scoreA?: number;
  scoreB?: number;
  winnerTeam?: string;
  winnerAdvancesTo?: string;
  date?: string;
  time?: string;
  place?: string;
};





// Componente principale della supercoppa
export default function SupercoppaPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [bannerClosed, setBannerClosed] = useState(false);

  // Carica le partite della supercoppa
  useEffect(() => {
    const loadMatches = async () => {
      try {
        setLoading(true);
        const q = query(
          collection(db, "matches"),
          where("phase", "==", "supercoppa"),
          orderBy("round", "asc"),
          orderBy("matchNumber", "asc")
        );
        
        const snapshot = await getDocs(q);
        const matchesData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Match[];
        
        setMatches(matchesData);
      } catch (err: any) {
        setError(err.message || "Errore nel caricamento delle partite");
      } finally {
        setLoading(false);
      }
    };

    loadMatches();
  }, []);



  // Calcola statistiche e stato completamento
  const { stats, isCompleted, winners } = useMemo(() => {
    const total = matches.length;
    const completed = matches.filter(m => m.status === "completed").length;
    const confirmed = matches.filter(m => m.status === "confirmed").length;
    const scheduled = matches.filter(m => m.status === "scheduled").length;
    
    // Determina se la supercoppa è completata (tutte le partite sono completate)
    const isCompleted = completed === total && total > 0;
    
    // Trova i vincitori (partite finali completate)
    const finalMatches = matches.filter(m => 
      m.round === Math.max(...matches.map(m => m.round)) && 
      m.status === "completed" && 
      m.winnerTeam
    );
    
    return { 
      stats: { total, completed, confirmed, scheduled },
      isCompleted,
      winners: finalMatches
    };
  }, [matches]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4"></div>
            <p className="text-emerald-800 font-medium">Caricamento Supercoppa...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <p className="text-red-800 font-medium">Errore: {error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <div className="bg-white rounded-lg shadow-lg p-8 max-w-md mx-auto">
              <div className="text-6xl mb-4">🏆</div>
              <h1 className="text-2xl font-bold text-gray-800 mb-4">Supercoppa</h1>
              <p className="text-gray-600 mb-6">
                La supercoppa non è ancora stata avviata. 
                Aspetta che l'amministratore generi le partite degli ottavi.
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-blue-800 text-sm">
                  La supercoppa verrà generata automaticamente quando il campionato sarà completato.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Banner vincitori (modal) */}
        <SupercoppaWinnerBanner 
          winners={winners} 
          isVisible={isCompleted && !bannerClosed} 
          onClose={() => setBannerClosed(true)}
        />
        
        {/* Header */}
        <div className="text-center mb-8">
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <div className="text-6xl mb-4">🏆</div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Supercoppa</h1>
            <p className="text-gray-600 mb-4">Torneo ad eliminazione diretta</p>
            
            {/* Statistiche */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              <div className="bg-blue-50 rounded-lg p-3">
                <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
                <div className="text-sm text-blue-800">Partite Totali</div>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3"> 
                <div className="text-2xl font-bold text-emerald-600">{stats.completed}</div>
                <div className="text-sm text-emerald-800">Completate</div>
              </div>
              <div className="bg-teal-50 rounded-lg p-3">
                <div className="text-2xl font-bold text-teal-600">{stats.confirmed}</div>
                <div className="text-sm text-teal-800">Confermate</div>
              </div>
              <div className="bg-orange-50 rounded-lg p-3">
                <div className="text-2xl font-bold text-orange-600">{stats.scheduled}</div>
                <div className="text-sm text-orange-800">Programmate</div>
              </div>
            </div>
          </div>
        </div>

        {/* Banner completamento */}
        <SupercoppaCompletedBanner 
          isVisible={isCompleted && !bannerClosed}
          winners={winners}
          onClose={() => setBannerClosed(true)}
        />

        {/* Schema ad albero */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-6 text-center">
            Schema del Torneo
          </h2>
          
          <TournamentBracket matches={matches} />
        </div>

        {/* Modal per dettagli partita */}
        {selectedMatch && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Dettagli Partita</h3>
                <button 
                  onClick={() => setSelectedMatch(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <strong>Round:</strong> {selectedMatch.roundLabel}
                </div>
                <div>
                  <strong>Match:</strong> {selectedMatch.matchNumber}
                </div>
                <div>
                  <strong>Stato:</strong> {selectedMatch.status}
                </div>
                {selectedMatch.date && (
                  <div>
                    <strong>Data:</strong> {formatDate(selectedMatch.date)}
                  </div>
                )}
                {selectedMatch.time && (
                  <div>
                    <strong>Ora:</strong> {formatTime(selectedMatch.time)}
                  </div>
                )}
                {selectedMatch.place && (
                  <div>
                    <strong>Campo:</strong> {selectedMatch.place}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
