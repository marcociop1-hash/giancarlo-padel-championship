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
    console.log('=== TEST FREEZE SIMPLE ===');
    const { matchday } = await request.json();
    console.log('Requested matchday:', matchday);

    if (matchday === undefined || matchday === null) {
      return NextResponse.json({ error: 'Matchday is required' }, { status: 400 });
    }

    console.log('Initializing Firebase admin...');
    const db = adminDb();
    console.log('Firebase admin initialized successfully');
    
    // Trova le partite della giornata
    console.log(`Looking for matches with matchday: ${matchday}`);
    const matchesSnapshot = await db.collection('matches')
      .where('phase', '==', 'campionato')
      .where('matchday', '==', matchday)
      .get();
    
    const matches = matchesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`Found ${matches.length} matches for matchday ${matchday}`);
    
    if (matches.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: `No matches found for matchday ${matchday}`,
        matchesCount: 0
      });
    }
    
    // Prova a aggiornare solo la prima partita
    const firstMatch = matches[0];
    console.log('Testing update on first match:', firstMatch.id);
    
    const matchRef = db.collection('matches').doc(firstMatch.id);
    
    // Aggiorna solo lo status
    const updateData = {
      status: 'da recuperare',
      testUpdatedAt: new Date()
    };
    
    console.log('Update data:', updateData);
    
    await matchRef.update(updateData);
    console.log('✅ Successfully updated first match');
    
    return NextResponse.json({
      success: true,
      message: `Test successful - updated 1 match for matchday ${matchday}`,
      matchesFound: matches.length,
      matchUpdated: firstMatch.id,
      updateData: updateData
    });

  } catch (error) {
    console.error('=== ERROR TEST FREEZE SIMPLE ===');
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error.message,
      name: error.name
    }, { status: 500 });
  }
}
