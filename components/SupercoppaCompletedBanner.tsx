"use client";

import { memo } from 'react';

type CompletedBannerProps = {
  isVisible: boolean;
  winners?: any[];
  onClose?: () => void;
};

const SupercoppaCompletedBanner = memo(({ isVisible, winners, onClose }: CompletedBannerProps) => {
  if (!isVisible) return null;

  const getTeamDisplay = (team: any[]) => {
    if (!team || team.length === 0) return "?";
    if (team.length === 1) return team[0]?.name || "?";
    return team.map(p => p?.name || "?").join(" + ");
  };

  const winnerNames = winners && winners.length > 0 
    ? getTeamDisplay(winners[0]?.teamA || winners[0]?.teamB || [])
    : "Vincitori";

  return (
    <div className="bg-gradient-to-r from-emerald-50 to-blue-50 border-2 border-emerald-200 rounded-xl p-6 mb-6 shadow-lg relative">
      {/* Pulsante di chiusura */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 text-xl font-bold bg-white rounded-full w-7 h-7 flex items-center justify-center shadow-md hover:bg-gray-100 transition-colors"
          title="Chiudi banner"
        >
          ✕
        </button>
      )}
      <div className="text-center">
        {/* Icona di completamento */}
        <div className="text-4xl mb-3">
          🎉
        </div>
        
        {/* Titolo */}
        <h2 className="text-2xl font-bold text-emerald-800 mb-2">
          Supercoppa Conclusa! 🏆
        </h2>
        
        {/* Messaggio */}
        <p className="text-emerald-700 mb-4">
          Il torneo ad eliminazione diretta è terminato con successo!
        </p>
        
        {/* Vincitori */}
        <div className="bg-white rounded-lg p-4 border border-emerald-200">
          <div className="text-lg font-semibold text-gray-800 mb-1">
            🥇 Campioni della Supercoppa:
          </div>
          <div className="text-xl font-bold text-emerald-600">
            {winnerNames}
          </div>
        </div>
        
        {/* Emoji celebrative */}
        <div className="flex justify-center gap-3 mt-4 text-xl">
          <span>🏆</span>
          <span>👑</span>
          <span>⭐</span>
          <span>🎊</span>
        </div>
      </div>
    </div>
  );
});

SupercoppaCompletedBanner.displayName = 'SupercoppaCompletedBanner';

export default SupercoppaCompletedBanner;



