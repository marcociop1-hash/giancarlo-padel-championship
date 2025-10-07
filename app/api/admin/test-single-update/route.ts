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
    console.log('=== TEST SINGLE MATCH UPDATE ===');
    const { matchId, newStatus } = await request.json();
    console.log('Requested matchId:', matchId, 'newStatus:', newStatus);

    if (!matchId) {
      return NextResponse.json({ error: 'MatchId is required' }, { status: 400 });
    }

    const status = newStatus || 'da recuperare';

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
    
    // Aggiorna solo lo status
    const updateData = {
      status: status,
      testUpdatedAt: new Date()
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
      testUpdatedAt: updatedData?.testUpdatedAt
    });
    
    return NextResponse.json({
      success: true,
      message: `Match ${matchId} successfully updated to '${status}'`,
      matchId: matchId,
      originalStatus: matchData?.status,
      newStatus: status,
      updatedData: {
        status: updatedData?.status,
        matchday: updatedData?.matchday,
        testUpdatedAt: updatedData?.testUpdatedAt
      }
    });

  } catch (error) {
    console.error('=== ERROR TESTING SINGLE MATCH UPDATE ===');
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
