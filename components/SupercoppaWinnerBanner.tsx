"use client";

import { memo } from 'react';

type WinnerBannerProps = {
  winners: any[];
  isVisible: boolean;
  onClose?: () => void;
};

const SupercoppaWinnerBanner = memo(({ winners, isVisible, onClose }: WinnerBannerProps) => {
  if (!isVisible || !winners || winners.length === 0) return null;

  const getTeamDisplay = (team: any[]) => {
    if (!team || team.length === 0) return "?";
    if (team.length === 1) return team[0]?.name || "?";
    return team.map(p => p?.name || "?").join(" + ");
  };

  const winnerTeam = winners[0]?.teamA || winners[0]?.teamB || [];
  const winnerNames = getTeamDisplay(winnerTeam);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-yellow-100 via-yellow-200 to-yellow-300 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl border-4 border-yellow-400 animate-pulse relative">
        {/* Pulsante di chiusura */}
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-600 hover:text-gray-800 text-2xl font-bold bg-white rounded-full w-8 h-8 flex items-center justify-center shadow-lg hover:bg-gray-100 transition-colors"
            title="Chiudi"
          >
            ✕
          </button>
        )}
        {/* Corona animata */}
        <div className="text-6xl mb-4 animate-bounce">
          👑
        </div>
        
        {/* Titolo */}
        <h1 className="text-3xl font-bold text-yellow-800 mb-4">
          🏆 SUPERCOPPA VINTA! 🏆
        </h1>
        
        {/* Vincitori */}
        <div className="bg-white rounded-xl p-6 mb-6 shadow-lg">
          <div className="text-2xl font-bold text-gray-800 mb-2">
            🎉 CAMPIONI! 🎉
          </div>
          <div className="text-xl font-semibold text-blue-600">
            {winnerNames}
          </div>
        </div>
        
        {/* Messaggio celebrativo */}
        <div className="text-lg text-yellow-700 font-medium">
          🥇 Primi classificati della Supercoppa 🥇
        </div>
        
        {/* Emoji celebrative */}
        <div className="flex justify-center gap-4 mt-6 text-2xl">
          <span className="animate-spin">⚡</span>
          <span className="animate-bounce">🚀</span>
          <span className="animate-pulse">💪</span>
          <span className="animate-spin">⭐</span>
        </div>
        
        {/* Messaggio finale */}
        <div className="mt-6 text-sm text-yellow-600">
          Complimenti ai vincitori! 🎊
        </div>
      </div>
    </div>
  );
});

SupercoppaWinnerBanner.displayName = 'SupercoppaWinnerBanner';

export default SupercoppaWinnerBanner;

