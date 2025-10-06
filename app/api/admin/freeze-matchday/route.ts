import { NextRequest, NextResponse } from 'next/server';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
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
    console.log('=== FREEZE MATCHDAY API CALLED ===');
    const { matchday } = await request.json();
    console.log('Requested matchday:', matchday);

    if (!matchday || typeof matchday !== 'number') {
      console.log('Invalid matchday parameter:', matchday);
      return NextResponse.json({ error: 'Matchday number is required' }, { status: 400 });
    }

    console.log('Initializing Firebase admin...');
    const db = adminDb();
    console.log('Firebase admin initialized successfully');
    
    // Cerca tutte le partite del campionato
    console.log('Querying championship matches...');
    const allMatchesSnapshot = await db.collection('matches')
      .where('phase', '==', 'campionato')
      .get();

    console.log(`Found ${allMatchesSnapshot.docs.length} championship matches`);

    if (allMatchesSnapshot.empty) {
      console.log('No championship matches found');
      return NextResponse.json({ error: 'No championship matches found' }, { status: 404 });
    }

    const allMatches = allMatchesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    console.log('All matches loaded:', allMatches.length);
    
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

    // IMPEDISCI IL CONGELAMENTO SOLO SE TUTTE LE PARTITE SONO COMPLETATE
    const completedMatches = targetMatches.filter((m: any) => m.status === 'completed');
    const totalMatches = targetMatches.length;
    
    console.log(`Matchday ${matchday} analysis: ${completedMatches.length}/${totalMatches} matches completed`);
    
    if (completedMatches.length === totalMatches && totalMatches > 0) {
      return NextResponse.json({ 
        error: `Cannot freeze matchday ${matchday} - all ${totalMatches} matches are completed. Freezing is only allowed when some matches are still incomplete.` 
      }, { status: 400 });
    }

    // Trova le partite da congelare (TUTTE le partite della giornata, completate e non)
    const matchesToFreeze = targetMatches; // Congela tutte le partite della giornata
    
    if (matchesToFreeze.length === 0) {
      return NextResponse.json({ 
        error: 'Matchday cannot be frozen - no matches found' 
      }, { status: 400 });
    }

    console.log(`Freezing matchday ${matchday}: ${matchesToFreeze.length} total matches (${completedMatches.length} completed, ${matchesToFreeze.length - completedMatches.length} incomplete)`);

    // TEST MINIMO - Solo aggiorna il primo match per testare
    console.log('=== MINIMAL TEST MODE ===');
    console.log(`Testing with first match only: ${matchesToFreeze[0]?.id}`);
    
    if (matchesToFreeze.length === 0) {
      return NextResponse.json({ error: 'No matches to freeze' }, { status: 400 });
    }

    const testMatch = matchesToFreeze[0];
    const matchRef = db.collection('matches').doc(testMatch.id);
    
    console.log(`Test match data:`, {
      id: testMatch.id,
      status: testMatch.status,
      scoreA: testMatch.scoreA,
      scoreB: testMatch.scoreB
    });

    // Test con updateData minimo
    const testUpdateData = {
      status: 'da recuperare',
      frozenAt: new Date(),
      originalMatchday: matchday,
      testMode: true
    };

    console.log(`Test update data:`, testUpdateData);

    try {
      await matchRef.update(testUpdateData);
      console.log(`Test update successful for match ${testMatch.id}`);
    } catch (updateError) {
      console.error('Test update failed:', updateError);
      throw updateError;
    }

    console.log(`Test mode successful for matchday ${matchday}`);

    return NextResponse.json({
      success: true,
      message: `Test mode: Successfully updated first match of matchday ${matchday}. This is a minimal test to isolate the error.`,
      testMode: true,
      testMatch: testMatch.id,
      totalMatches: targetMatches.length,
      note: `Only first match was updated in test mode`
    });

  } catch (error) {
    console.error('=== ERROR FREEZING MATCHDAY ===');
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    console.error('Full error object:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error.message,
      name: error.name
    }, { status: 500 });
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
