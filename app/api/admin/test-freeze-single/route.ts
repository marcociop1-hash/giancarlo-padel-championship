import { NextRequest, NextResponse } from 'next/server';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function adminDb() {
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }
  return getFirestore();
}

export async function POST(request: NextRequest) {
  try {
    console.log('=== TEST FREEZE SINGLE MATCH ===');
    const { matchId } = await request.json();
    console.log('Requested matchId:', matchId);

    if (!matchId) {
      return NextResponse.json({ error: 'MatchId is required' }, { status: 400 });
    }

    console.log('Initializing Firebase admin...');
    const db = adminDb();
    console.log('Firebase admin initialized successfully');
    
    // Trova la partita specifica
    console.log(`Looking for match: ${matchId}`);
    const matchDoc = await db.collection('matches').doc(matchId).get();
    
    if (!matchDoc.exists) {
      console.log(`Match ${matchId} not found`);
      return NextResponse.json({ error: `Match ${matchId} not found` }, { status: 404 });
    }
    
    const matchData = matchDoc.data();
    console.log('Match found:', {
      id: matchId,
      status: matchData?.status,
      matchday: matchData?.matchday,
      phase: matchData?.phase,
      scoreA: matchData?.scoreA,
      scoreB: matchData?.scoreB
    });
    
    // Salva i dati originali
    const originalData = {
      status: matchData?.status,
      scoreA: matchData?.scoreA,
      scoreB: matchData?.scoreB,
      totalGamesA: matchData?.totalGamesA,
      totalGamesB: matchData?.totalGamesB,
      set1Games: matchData?.set1Games,
      set2Games: matchData?.set2Games,
      set3Games: matchData?.set3Games,
      completedBy: matchData?.completedBy,
      completedAt: matchData?.completedAt,
      confirmedBy: matchData?.confirmedBy,
      confirmedAt: matchData?.confirmedAt
    };
    
    console.log('Original data to save:', originalData);
    
    // Prepara i dati di aggiornamento
    const updateData: any = {
      status: 'da recuperare',
      frozenAt: new Date(),
      originalMatchday: matchData?.matchday || 1,
      originalData: originalData,
      // Rimuovi i campi di risultato impostandoli a null
      scoreA: null,
      scoreB: null,
      totalGamesA: null,
      totalGamesB: null,
      set1Games: null,
      set2Games: null,
      set3Games: null,
      completedBy: null,
      completedAt: null
    };
    
    console.log('Update data:', updateData);
    
    // Aggiorna la partita
    console.log(`Updating match ${matchId}...`);
    const matchRef = db.collection('matches').doc(matchId);
    await matchRef.update(updateData);
    
    console.log(`Successfully updated match ${matchId}`);
    
    // Verifica l'aggiornamento
    const updatedDoc = await db.collection('matches').doc(matchId).get();
    const updatedData = updatedDoc.data();
    
    console.log('Updated match data:', {
      id: matchId,
      status: updatedData?.status,
      matchday: updatedData?.matchday,
      scoreA: updatedData?.scoreA,
      scoreB: updatedData?.scoreB,
      frozenAt: updatedData?.frozenAt,
      originalData: updatedData?.originalData
    });
    
    return NextResponse.json({
      success: true,
      message: `Match ${matchId} successfully set to 'da recuperare'`,
      matchId: matchId,
      originalStatus: originalData.status,
      newStatus: 'da recuperare',
      originalData: originalData,
      updatedData: {
        status: updatedData?.status,
        matchday: updatedData?.matchday,
        scoreA: updatedData?.scoreA,
        scoreB: updatedData?.scoreB,
        frozenAt: updatedData?.frozenAt
      }
    });

  } catch (error) {
    console.error('=== ERROR TESTING SINGLE MATCH FREEZE ===');
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
    console.log('=== GET ALL MATCHES FOR TESTING ===');
    const db = adminDb();
    
    const matchesSnapshot = await db.collection('matches')
      .where('phase', '==', 'campionato')
      .get();
    
    const matches = matchesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`Found ${matches.length} championship matches`);
    
    return NextResponse.json({
      success: true,
      matches: matches.map(m => ({
        id: m.id,
        status: m.status,
        matchday: m.matchday,
        date: m.date,
        teamA: m.teamA,
        teamB: m.teamB,
        scoreA: m.scoreA,
        scoreB: m.scoreB
      }))
    });

  } catch (error) {
    console.error('Error getting matches:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
