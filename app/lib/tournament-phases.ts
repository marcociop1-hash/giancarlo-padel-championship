// Nuovo file per gestire le fasi del torneo
export type TournamentPhase = 'campionato' | 'supercoppa' | 'completato';

export type TournamentState = {
  phase: TournamentPhase;
  currentMatchday?: number;
  isFrozen?: boolean;
  frozenMatchday?: number;
};

export type MatchStatus = 'programmata' | 'confermata' | 'completata' | 'da recuperare';

export type MatchRecovery = {
  matchId: string;
  originalMatchday: number;
  recoveryDate?: Date;
  notes?: string;
};

export interface TournamentConfig {
  currentPhase: TournamentPhase;
  campionatoCompleted: boolean;
  supercoppaActive: boolean;
  supercoppaStartDate?: Date;
}

export function isCampionatoComplete(matches: any): boolean {
  const arr = Array.isArray(matches)
    ? matches
    : matches?.docs
    ? matches.docs.map((d: any) => d.data?.() ?? d)
    : [];

  if (!arr.length) return false;

  return arr.every((m: any) =>
    (m.status === 'completed' || m.completed === true) &&
    (m.phase === 'campionato' || !m.phase)
  );
}

export function canStartSupercoppa(state: TournamentConfig | null | undefined): boolean {
  if (!state) return false;
  return !!state.campionatoCompleted && !state.supercoppaActive;
}

export const canFreezeMatchday = (matches: any[], matchday: number): boolean => {
  const matchdayMatches = matches.filter(m => m.matchday === matchday);
  const incompleteMatches = matchdayMatches.filter(m => m.status !== 'completata');
  return incompleteMatches.length > 0;
};

export const shouldFreezeMatchday = (matches: any[], matchday: number): boolean => {
  const matchdayMatches = matches.filter(m => m.matchday === matchday);
  const completedMatches = matchdayMatches.filter(m => m.status === 'completata');
  const totalMatches = matchdayMatches.length;
  
  // Se almeno una partita non è completata, congela la giornata
  // Questo garantisce che se ci sono recuperi, nessuna partita della giornata influenzi la classifica
  return completedMatches.length < totalMatches;
};

export const getFrozenMatchdays = (matches: any[]): number[] => {
  const matchdays = [...new Set(matches.map(m => m.matchday))];
  return matchdays.filter(matchday => {
    // Una giornata è congelata se ha almeno una partita da recuperare
    const hasRecoveries = matches.some(m => 
      m.originalMatchday === matchday && m.status === 'da recuperare'
    );
    
    // O se ha partite incomplete (per compatibilità)
    const hasIncomplete = shouldFreezeMatchday(matches, matchday);
    
    return hasRecoveries || hasIncomplete;
  });
};

export const getRecoveryMatches = (matches: any[]): any[] => {
  return matches.filter(m => m.status === 'da recuperare');
};