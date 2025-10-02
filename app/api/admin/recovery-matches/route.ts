import { NextRequest, NextResponse } from 'next/server';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

function adminDb() {
  if (!getApps().length) {
    const projectId = process.env.FIREBASE_PROJECT_ID!;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL!;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n');
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  return getFirestore();
}

export async function GET() {
  try {
    // Per ora restituiamo un array vuoto per testare la connessione
    return NextResponse.json({
      recoveryMatches: [],
      total: 0
    });

  } catch (error) {
    console.error('Error getting recovery matches:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { matchId, scoreA, scoreB, winner, notes } = await request.json();

    if (!matchId || !scoreA || !scoreB || !winner) {
      return NextResponse.json({ 
        error: 'Match ID, scores, and winner are required' 
      }, { status: 400 });
    }

    const db = adminDb();
    const matchRef = db.collection('matches').doc(matchId);
    const matchDoc = await matchRef.get();

    if (!matchDoc.exists) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    const matchData = matchDoc.data();
    
    if (!matchData || matchData.status !== 'da recuperare') {
      return NextResponse.json({ 
        error: 'Match is not in recovery status' 
      }, { status: 400 });
    }

    // Calcola i punti per ogni giocatore
    const players = [...(matchData.teamA || []), ...(matchData.teamB || [])];
    const winningTeam = winner === 'A' ? matchData.teamA : matchData.teamB;
    const losingTeam = winner === 'A' ? matchData.teamB : matchData.teamA;

    const playerUpdates = players.map(playerId => {
      const isWinner = winningTeam.includes(playerId);
      return {
        playerId,
        points: isWinner ? 3 : 0,
        isWinner
      };
    });

    // Aggiorna la partita
    await matchRef.update({
      status: 'completata',
      scoreA: parseInt(scoreA),
      scoreB: parseInt(scoreB),
      winner: winner,
      completedAt: new Date(),
      recoveryNotes: notes || '',
      playerResults: playerUpdates
    });

    // Aggiorna le classifiche dei giocatori
    const standingsRef = db.collection('standings');
    const batch = db.batch();

    playerUpdates.forEach(({ playerId, points, isWinner }) => {
      const playerStandingRef = standingsRef.doc(playerId);
      batch.update(playerStandingRef, {
        points: FieldValue.increment(points),
        matchesPlayed: FieldValue.increment(1),
        matchesWon: FieldValue.increment(isWinner ? 1 : 0),
        lastUpdated: new Date()
      });
    });

    await batch.commit();

    // Verifica se tutte le partite da recuperare della giornata sono completate
    const originalMatchday = matchData.originalMatchday;
    
    if (originalMatchday) {
      // Controlla se ci sono ancora partite da recuperare per questa giornata
      const remainingRecoveries = await db.collection('matches')
        .where('originalMatchday', '==', originalMatchday)
        .where('status', '==', 'da recuperare')
        .get();
      
      // Se non ci sono più partite da recuperare, sblocca la giornata
      if (remainingRecoveries.empty) {
        const tournamentRef = db.collection('tournament').doc('state');
        await tournamentRef.update({
          isFrozen: false,
          frozenMatchday: null,
          lastUpdated: new Date()
        });
        
        console.log(`Matchday ${originalMatchday} automatically unfrozen - all recovery matches completed`);
      }
    }

    // Invalida la cache della classifica
    try {
      await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/classifica?refresh=true`);
    } catch (e) {
      console.log('Cache invalidation failed:', e);
    }

    return NextResponse.json({
      success: true,
      message: 'Recovery match completed successfully',
      matchId,
      playerUpdates
    });

  } catch (error) {
    console.error('Error completing recovery match:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
