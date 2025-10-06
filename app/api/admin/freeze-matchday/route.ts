import { NextRequest, NextResponse } from 'next/server';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { shouldFreezeMatchday, getFrozenMatchdays } from '../../../lib/tournament-phases';

// Funzione per calcolare la classifica prima di una giornata
function calculateStandingsBeforeMatchday(matches: any[]) {
  console.log('=== CALCOLO CLASSIFICA PRIMA GIORNATA ===');
  console.log('calculateStandingsBeforeMatchday chiamata con', matches.length, 'partite');
  
  const stats = new Map<string, {
    name: string; 
    points: number; 
    setsWon: number; 
    setsLost: number; 
    played: number;
    gamesWon: number;    // Game vinti
    gamesLost: number;   // Game persi
    matchIds: string[]; // DEBUG: traccia le partite per ogni giocatore
  }>();

  const ensure = (id: string, name: string) => {
    if (!stats.has(id)) {
      stats.set(id, { name, points: 0, setsWon: 0, setsLost: 0, played: 0, gamesWon: 0, gamesLost: 0, matchIds: [] });
    }
    return stats.get(id)!;
  };

  matches.forEach((m, index) => {
    // Solo partite completate
    if (m.status !== 'completed') return;
    
    const matchId = m.id || `match_${index}`;
    const teamA = m.teamA || [];
    const teamB = m.teamB || [];
    
    if (teamA.length < 2 || teamB.length < 2) return;
    
    const scoreA = m.scoreA || 0;
    const scoreB = m.scoreB || 0;
    
    // Calcola punti (3 per vittoria, 1 per pareggio, 0 per sconfitta)
    const pointsA = scoreA > scoreB ? 3 : (scoreA === scoreB ? 1 : 0);
    const pointsB = scoreB > scoreA ? 3 : (scoreA === scoreB ? 1 : 0);
    
    // Calcola set vinti/persi
    const setsA = scoreA;
    const setsB = scoreB;
    
    // Calcola game vinti/persi
    const gamesA = m.totalGamesA || 0;
    const gamesB = m.totalGamesB || 0;
    
    // Aggiorna statistiche per team A
    teamA.forEach((player: any) => {
      const s = ensure(player.id || player.uid, player.name);
      s.points += pointsA;
      s.setsWon += setsA;
      s.setsLost += setsB;
      s.played += 1;
      s.gamesWon += gamesA;
      s.gamesLost += gamesB;
      s.matchIds.push(matchId);
    });
    
    // Aggiorna statistiche per team B
    teamB.forEach((player: any) => {
      const s = ensure(player.id || player.uid, player.name);
      s.points += pointsB;
      s.setsWon += setsB;
      s.setsLost += setsA;
      s.played += 1;
      s.gamesWon += gamesB;
      s.gamesLost += gamesA;
      s.matchIds.push(matchId);
    });
  });

  const result = Array.from(stats.entries())
    .map(([id, s]) => ({
      playerId: id,
      name: s.name,
      points: s.points,
      setsWon: s.setsWon,
      setsLost: s.setsLost,
      setDiff: s.setsWon - s.setsLost,
      gamesWon: s.gamesWon,
      gamesLost: s.gamesLost,
      gameDiff: s.gamesWon - s.gamesLost,
      played: s.played,
      matchIds: s.matchIds,
    }))
    .sort((x, y) => (
      y.points - x.points ||
      (y.setsWon - y.setsLost) - (x.setsWon - x.setsLost) ||
      (y.gamesWon - y.gamesLost) - (x.gamesWon - x.gamesLost) ||
      x.played - y.played ||
      x.name.localeCompare(y.name)
    ));
    
  console.log('=== RISULTATO CLASSIFICA PRIMA GIORNATA ===');
  console.log('Total players:', result.length);
  result.forEach((player, index) => {
    console.log(`${index + 1}. ${player.name}: ${player.points} punti, ${player.played} partite, game ${player.gamesWon}-${player.gamesLost} (diff: ${player.gameDiff})`);
  });
  console.log('=== FINE CALCOLO CLASSIFICA PRIMA GIORNATA ===\n');
  
  return result;
}

function adminDb() {
  if (!getApps().length) {
    const projectId = process.env.FIREBASE_PROJECT_ID!;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL!;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n');
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  return getFirestore();
}

export async function POST(request: NextRequest) {
  try {
    const { matchday } = await request.json();

    if (!matchday || typeof matchday !== 'number') {
      return NextResponse.json({ error: 'Matchday number is required' }, { status: 400 });
    }

    const db = adminDb();
    
    // Cerca tutte le partite del campionato
    const allMatchesSnapshot = await db.collection('matches')
      .where('phase', '==', 'campionato')
      .get();

    if (allMatchesSnapshot.empty) {
      return NextResponse.json({ error: 'No championship matches found' }, { status: 404 });
    }

    const allMatches = allMatchesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Se non ci sono partite con matchday specifico, assegna il matchday alle partite senza matchday
    let targetMatches = allMatches.filter((m: any) => m.matchday === matchday);
    
    if (targetMatches.length === 0) {
      const matchesWithoutMatchday = allMatches.filter((m: any) => !m.matchday || m.matchday === null || m.matchday === undefined);
      
      if (matchesWithoutMatchday.length === 0) {
        const availableMatchdays = [...new Set(allMatches.map((m: any) => m.matchday).filter(Boolean))];
        return NextResponse.json({ 
          error: `No matches found for matchday ${matchday}. Available matchdays: ${availableMatchdays.join(', ')}` 
        }, { status: 404 });
      }
      
      // Assegna il matchday alle partite che non ce l'hanno
      console.log(`Found ${matchesWithoutMatchday.length} matches without matchday, assigning matchday ${matchday}...`);
      const updateBatch = db.batch();
      matchesWithoutMatchday.forEach((match: any) => {
        const matchRef = db.collection('matches').doc(match.id);
        updateBatch.update(matchRef, { matchday: matchday });
      });
      await updateBatch.commit();
      
      // Aggiorna targetMatches con le partite appena modificate
      targetMatches = matchesWithoutMatchday.map(m => ({ ...m, matchday }));
    }

    // Verifica se la giornata ha già partite da recuperare
    const hasRecoveries = targetMatches.some((m: any) => m.status === 'da recuperare');
    
    if (hasRecoveries) {
      return NextResponse.json({ 
        error: 'Matchday already has recovery matches - cannot freeze again' 
      }, { status: 400 });
    }

    // IMPEDISCI IL CONGELAMENTO DI PARTITE COMPLETATE
    const completedMatches = targetMatches.filter((m: any) => m.status === 'completed');
    if (completedMatches.length > 0) {
      return NextResponse.json({ 
        error: `Cannot freeze matchday ${matchday} - it contains ${completedMatches.length} completed matches. Only incomplete matches can be frozen.` 
      }, { status: 400 });
    }

    // Trova le partite da congelare (tutte quelle non completate)
    const matchesToFreeze = targetMatches.filter((m: any) => m.status !== 'completed');
    
    if (matchesToFreeze.length === 0) {
      return NextResponse.json({ 
        error: 'Matchday cannot be frozen - no matches to freeze' 
      }, { status: 400 });
    }

    console.log(`Freezing matchday ${matchday}: ${matchesToFreeze.length} matches to freeze`);

    // CALCOLA LA CLASSIFICA PRIMA DELLA GIORNATA (escludendo le partite di questa giornata)
    const matchesBeforeMatchday = allMatches.filter((m: any) => 
      m.matchday !== matchday && 
      m.status === 'completed' &&
      m.phase === 'campionato'
    );

    console.log(`Calculating standings before matchday ${matchday}: ${matchesBeforeMatchday.length} completed matches`);

    // Calcola la classifica prima della giornata
    const standingsBefore = calculateStandingsBeforeMatchday(matchesBeforeMatchday);
    console.log(`Standings before matchday ${matchday}:`, standingsBefore.length, 'players');

    // Salva la classifica di backup
    const backupRef = db.collection('standings_backup').doc(`matchday_${matchday}_before`);
    await backupRef.set({
      matchday: matchday,
      standings: standingsBefore,
      frozenAt: new Date(),
      matchesCount: matchesBeforeMatchday.length
    });

    // CONGELA TUTTE LE PARTITE DELLA GIORNATA
    const batch = db.batch();
    
    matchesToFreeze.forEach((match: any) => {
      const matchRef = db.collection('matches').doc(match.id);
      
      // Salva i dati originali per il ripristino
      const originalData = {
        status: match.status,
        scoreA: match.scoreA,
        scoreB: match.scoreB,
        totalGamesA: match.totalGamesA,
        totalGamesB: match.totalGamesB,
        set1Games: match.set1Games,
        set2Games: match.set2Games,
        set3Games: match.set3Games,
        completedBy: match.completedBy,
        completedAt: match.completedAt,
        confirmedBy: match.confirmedBy,
        confirmedAt: match.confirmedAt
      };

      batch.update(matchRef, {
        status: 'da recuperare',
        frozenAt: new Date(),
        originalMatchday: matchday,
        originalData: originalData, // Salva i dati originali per il ripristino
        // Rimuovi tutti i dati di risultato
        scoreA: null,
        scoreB: null,
        totalGamesA: null,
        totalGamesB: null,
        set1Games: null,
        set2Games: null,
        set3Games: null,
        completedBy: null,
        completedAt: null
      });
    });

    await batch.commit();

    console.log(`Successfully frozen matchday ${matchday}: ${matchesToFreeze.length} matches frozen`);

    return NextResponse.json({
      success: true,
      message: `Matchday ${matchday} frozen successfully. ${matchesToFreeze.length} matches set to recovery status. Standings restored to pre-matchday state.`,
      frozenMatches: matchesToFreeze.length,
      totalMatches: targetMatches.length,
      standingsBackup: standingsBefore.length
    });

  } catch (error) {
    console.error('Error freezing matchday:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET() {
  try {
    // Per ora restituiamo un array vuoto per testare la connessione
    return NextResponse.json({
      frozenMatchdays: [],
      totalMatches: 0,
      recoveryMatches: 0
    });

  } catch (error) {
    console.error('Error getting frozen matchdays:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
