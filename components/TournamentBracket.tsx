"use client";

import { memo } from 'react';
import { formatDate, formatTime } from '../lib/utils';

type Match = {
  id: string;
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

type TournamentBracketProps = {
  matches: Match[];
};

const MatchCard = memo(({ match, isWinner }: { match: any; isWinner: boolean }) => {
  const formatDate = (date: string) => {
    if (!date) return "";
    return new Date(date).toLocaleDateString("it-IT");
  };

  const formatTime = (time: string) => {
    if (!time) return "";
    return time;
  };

  const getTeamDisplay = (team: any[]) => {
    if (!team || team.length === 0) return "?";
    if (team.length === 1) return team[0]?.name || "?";
    return team.map(p => p?.name || "?").join(" + ");
  };

  const isPlaceholder = match.isPlaceholder || match.status === "placeholder";
  const hasScore = match.scoreA !== undefined && match.scoreB !== undefined;

  return (
    <div className={`border rounded-lg p-3 min-w-[200px] ${
      isWinner 
        ? "border-emerald-500 bg-emerald-50" 
        : isPlaceholder
        ? "border-gray-300 bg-gray-50"
        : "border-gray-300 bg-white"
    }`}>
      <div className="text-center font-medium text-sm mb-2">
        {match.roundLabel} - Partita {match.matchNumber}
      </div>

      <div className="space-y-2">
        <div className={`text-sm ${isWinner && match.winnerTeam === "A" ? "font-bold text-emerald-700" : ""}`}>
          {isPlaceholder ? "?" : getTeamDisplay(match.teamA)}
        </div>
        
        {hasScore && (
          <div className="text-center font-bold text-lg">
            {match.scoreA} - {match.scoreB}
          </div>
        )}
        
        <div className={`text-sm ${isWinner && match.winnerTeam === "B" ? "font-bold text-emerald-700" : ""}`}>
          {isPlaceholder ? "?" : getTeamDisplay(match.teamB)}
        </div>
      </div>

      {isPlaceholder && (
        <div className="mt-2 text-center">
          <span className="text-xs text-gray-500">In attesa...</span>
        </div>
      )}

      {isWinner && !isPlaceholder && (
        <div className="mt-1 text-center">
          <span className="text-xs text-emerald-600 font-medium">🏆 {match.winnerTeam === "A" ? getTeamDisplay(match.teamA) : getTeamDisplay(match.teamB)}</span>
        </div>
      )}

      {(match.date || match.time || match.place) && !isPlaceholder && (
        <div className="mt-2 text-xs text-gray-500 space-y-1">
          {match.date && <div>📅 {formatDate(match.date)}</div>}
          {match.time && <div>🕒 {formatTime(match.time)}</div>}
          {match.place && <div>📍 {match.place}</div>}
        </div>
      )}
    </div>
  );
});

const TournamentBracket = memo(({ matches }: TournamentBracketProps) => {
  // Organizza le partite per round
  const rounds = {
    1: matches.filter(m => m.round === 1).sort((a, b) => a.matchNumber - b.matchNumber),
    2: matches.filter(m => m.round === 2).sort((a, b) => a.matchNumber - b.matchNumber),
    3: matches.filter(m => m.round === 3).sort((a, b) => a.matchNumber - b.matchNumber),
    4: matches.filter(m => m.round === 4).sort((a, b) => a.matchNumber - b.matchNumber),
  };

  // Determina dinamicamente i round presenti e le loro etichette
  const presentRounds = Object.keys(rounds)
    .map(Number)
    .filter(round => rounds[round as keyof typeof rounds].length > 0)
    .sort((a, b) => a - b);

  const roundLabels = {
    1: "Quarti di finale", // Round 1: Quarti di finale (4 partite da 4 giocatori)
    2: "Semifinali",       // Round 2: Semifinali (2 partite)
    3: "Finale",           // Round 3: Finale (1 partita)
    4: "Finale"            // Round 4: Finale (per compatibilità)
  };

  const getRoundColor = (round: number) => {
    switch (round) {
      case 1: return "border-blue-200 bg-blue-50";
      case 2: return "border-purple-200 bg-purple-50";
      case 3: return "border-orange-200 bg-orange-50";
      case 4: return "border-emerald-200 bg-emerald-50";
      default: return "border-gray-200 bg-gray-50";
    }
  };

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-8 min-w-max p-6">
        {presentRounds.map((round, roundIndex) => (
          <div key={round} className={`flex flex-col gap-4 ${getRoundColor(round)} rounded-lg p-4`}>
            <h3 className="text-center font-semibold text-sm" style={{
              color: round === 1 ? '#1e40af' : 
                     round === 2 ? '#7c3aed' : 
                     round === 3 ? '#ea580c' : 
                     '#059669'
            }}>
              {roundLabels[round as keyof typeof roundLabels]}
            </h3>
            <div className={`space-y-${round === 1 ? '3' : round === 2 ? '6' : round === 3 ? '8' : '4'}`}>
              {rounds[round as keyof typeof rounds].map((match, index) => (
                <div key={match.id} className="relative">
                  <MatchCard 
                    match={match} 
                    isWinner={match.winnerTeam !== undefined}
                  />
                  {/* Linea di connessione verso il round successivo */}
                  {roundIndex < presentRounds.length - 1 && index % 2 === 0 && (
                    <div className="absolute top-1/2 -right-4 w-4 h-px bg-gray-300 transform -translate-y-1/2"></div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

TournamentBracket.displayName = 'TournamentBracket';
MatchCard.displayName = 'MatchCard';

export default TournamentBracket;
