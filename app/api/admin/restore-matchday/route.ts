import { NextRequest, NextResponse } from 'next/server';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function adminDb() {
  if (!getApps().length) {
    const projectId = process.env.FIREBASE_PROJECT_ID!;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL!;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n');
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  return getFirestore();
}

// API per ripristinare i dati di una partita da recuperare quando viene completata
export async function POST(request: NextRequest) {
  try {
    const { matchId } = await request.json();

    if (!matchId) {
      return NextResponse.json({ error: 'Match ID is required' }, { status: 400 });
    }

    const db = adminDb();
    
    // Recupera la partita
    const matchDoc = await db.collection('matches').doc(matchId).get();
    
    if (!matchDoc.exists) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    const match = matchDoc.data();
    
    // Verifica che sia una partita da recuperare
    if (match?.status !== 'da recuperare') {
      return NextResponse.json({ error: 'Match is not in recovery status' }, { status: 400 });
    }

    // Verifica che abbia i dati originali salvati
    if (!match?.originalData) {
      return NextResponse.json({ error: 'No original data found for this match' }, { status: 400 });
    }

    const originalData = match.originalData;
    
    // Ripristina i dati originali
    await db.collection('matches').doc(matchId).update({
      status: originalData.status || 'completed',
      scoreA: originalData.scoreA,
      scoreB: originalData.scoreB,
      totalGamesA: originalData.totalGamesA,
      totalGamesB: originalData.totalGamesB,
      set1Games: originalData.set1Games,
      set2Games: originalData.set2Games,
      set3Games: originalData.set3Games,
      completedBy: originalData.completedBy,
      completedAt: originalData.completedAt,
      confirmedBy: originalData.confirmedBy,
      confirmedAt: originalData.confirmedAt,
      restoredAt: new Date(),
      // Mantieni i campi di congelamento per tracciabilità
      frozenAt: match.frozenAt,
      originalMatchday: match.originalMatchday
    });

    console.log(`Successfully restored match ${matchId} with original data`);

    return NextResponse.json({
      success: true,
      message: `Match ${matchId} restored successfully`,
      restoredData: {
        status: originalData.status,
        scoreA: originalData.scoreA,
        scoreB: originalData.scoreB,
        totalGamesA: originalData.totalGamesA,
        totalGamesB: originalData.totalGamesB
      }
    });

  } catch (error) {
    console.error('Error restoring match:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// API per ottenere lo stato di backup di una giornata
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const matchday = searchParams.get('matchday');

    if (!matchday) {
      return NextResponse.json({ error: 'Matchday parameter is required' }, { status: 400 });
    }

    const db = adminDb();
    
    // Recupera il backup della classifica
    const backupDoc = await db.collection('standings_backup').doc(`matchday_${matchday}_before`).get();
    
    if (!backupDoc.exists) {
      return NextResponse.json({ error: 'No backup found for this matchday' }, { status: 404 });
    }

    const backup = backupDoc.data();

    return NextResponse.json({
      success: true,
      backup: {
        matchday: backup?.matchday,
        standings: backup?.standings,
        frozenAt: backup?.frozenAt,
        matchesCount: backup?.matchesCount
      }
    });

  } catch (error) {
    console.error('Error getting backup:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
