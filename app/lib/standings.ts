// app/lib/standings.ts
// Calcolo classifica personale per padel (4 giocatori a match).
// Ogni set vinto = 1 punto personale.
// Colonne richieste: P (partite giocate), DG (set vinti - set persi), P (punti = set vinti).

export type PlayerID = string;

export interface MatchDoc {
  id: string;
  teamA: [PlayerID, PlayerID];
  teamB: [PlayerID, PlayerID];
  // Ogni set è [gamesA, gamesB] oppure { winner: 'A' | 'B' }
  sets: Array<[number, number] | { winner: 'A' | 'B' }>;
  status?: 'scheduled' | 'completed';
  scheduledAt?: string;
  court?: string;
}

export interface PlayerDoc {
  id: PlayerID;
  name: string;
}

export interface StandingRow {
  playerId: PlayerID;
  name: string;
  matchesPlayed: number; // P: partite giocate
  setDiff: number;       // DG: set vinti - set persi
  points: number;        // P: punti (ogni set vinto = 1)
  setsWon: number;
  setsLost: number;
}

export interface StandingsResult {
  rows: StandingRow[];
  sort: string;
}

export function computeStandings(players: PlayerDoc[], matches: MatchDoc[]): StandingsResult {
  const byId = new Map<PlayerID, StandingRow>();

  // Inizializza tutti i giocatori
  for (const p of players) {
    byId.set(p.id, {
      playerId: p.id,
      name: p.name ?? 'Senza nome',
      matchesPlayed: 0,
      setDiff: 0,
      points: 0,
      setsWon: 0,
      setsLost: 0,
    });
  }

  // Consideriamo completate le partite con status 'completed' oppure con almeno 2 set validi
  const completed = matches.filter(m => m.status === 'completed' || isCompletedBySets(m));

  for (const match of completed) {
    let setsWonA = 0;
    let setsWonB = 0;

    for (const s of match.sets ?? []) {
      if (Array.isArray(s)) {
        const [ga, gb] = s;
        if (isFiniteNumber(ga) && isFiniteNumber(gb) && ga !== gb) {
          if (ga > gb) setsWonA += 1; else setsWonB += 1;
        }
      } else if (s && (s as any).winner) {
        if ((s as any).winner === 'A') setsWonA += 1;
        if ((s as any).winner === 'B') setsWonB += 1;
      }
    }

    const playersA = match.teamA ?? [];
    const playersB = match.teamB ?? [];

    // P: partite giocate
    for (const pid of [...playersA, ...playersB]) {
      const row = byId.get(pid);
      if (row) row.matchesPlayed += 1;
    }

    // Punti & DG (tramite setsWon / setsLost)
    for (const pid of playersA) {
      const row = byId.get(pid);
      if (!row) continue;
      row.setsWon += setsWonA;
      row.setsLost += setsWonB;
      row.points += setsWonA; // 1 punto per ogni set vinto
    }
    for (const pid of playersB) {
      const row = byId.get(pid);
      if (!row) continue;
      row.setsWon += setsWonB;
      row.setsLost += setsWonA;
      row.points += setsWonB;
    }
  }

  const rows: StandingRow[] = [];
  for (const row of byId.values()) {
    row.setDiff = row.setsWon - row.setsLost; // DG
    rows.push(row);
  }

  // Ordinamento: Punti desc, DG desc, P (partite giocate) asc, Nome asc
  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.setDiff !== a.setDiff) return b.setDiff - a.setDiff;
    if (a.matchesPlayed !== b.matchesPlayed) return a.matchesPlayed - b.matchesPlayed;
    return a.name.localeCompare(b.name, 'it');
  });

  return { rows, sort: 'points DESC, setDiff DESC, matchesPlayed ASC, name ASC' };
}

function isCompletedBySets(m: MatchDoc): boolean {
  let valid = 0;
  for (const s of m.sets ?? []) {
    if (Array.isArray(s)) {
      const [ga, gb] = s;
      if (isFiniteNumber(ga) && isFiniteNumber(gb) && ga !== gb) valid += 1;
    } else if (s && (s as any).winner) {
      const w = (s as any).winner;
      if (w === 'A' || w === 'B') valid += 1;
    }
  }
  return valid >= 2; // best-of-3
}

function isFiniteNumber(n: any): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}
