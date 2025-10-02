"use client";

import { memo } from 'react';

type CompletedBannerProps = {
  isVisible: boolean;
  winners?: any[];
};

const SupercoppaCompletedBanner = memo(({ isVisible, winners }: CompletedBannerProps) => {
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
    <div className="bg-gradient-to-r from-emerald-50 to-blue-50 border-2 border-emerald-200 rounded-xl p-6 mb-6 shadow-lg">
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



