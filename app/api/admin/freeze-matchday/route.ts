import { NextRequest, NextResponse } from 'next/server';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { shouldFreezeMatchday, getFrozenMatchdays } from '../../../lib/tournament-phases';

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

    // Verifica se la giornata può essere congelata
    const db = adminDb();
    const matchesRef = db.collection('matches');
    const matchesSnapshot = await matchesRef
      .where('matchday', '==', matchday)
      .where('phase', '==', 'campionato')
      .get();

    if (matchesSnapshot.empty) {
      return NextResponse.json({ error: 'No matches found for this matchday' }, { status: 404 });
    }

    const matches = matchesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Verifica se la giornata ha già partite da recuperare
    const hasRecoveries = matches.some((m: any) => m.status === 'da recuperare');
    
    if (hasRecoveries) {
      return NextResponse.json({ 
        error: 'Matchday already has recovery matches - cannot freeze again' 
      }, { status: 400 });
    }

    if (!shouldFreezeMatchday(matches, matchday)) {
      return NextResponse.json({ 
        error: 'Matchday cannot be frozen - all matches are completed' 
      }, { status: 400 });
    }

    // Aggiorna tutte le partite incomplete della giornata a "da recuperare"
    const batch = db.batch();
    const incompleteMatches = matches.filter((m: any) => m.status !== 'completata');

    incompleteMatches.forEach((match: any) => {
      const matchRef = matchesRef.doc(match.id);
      batch.update(matchRef, {
        status: 'da recuperare',
        frozenAt: new Date(),
        originalMatchday: matchday
      });
    });

    // Aggiorna lo stato del torneo
    const tournamentRef = db.collection('tournament').doc('state');
    batch.update(tournamentRef, {
      isFrozen: true,
      frozenMatchday: matchday,
      lastUpdated: new Date()
    });

    await batch.commit();

    // Invalida la cache della classifica
    try {
      await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/classifica?refresh=true`);
    } catch (e) {
      console.log('Cache invalidation failed:', e);
    }

    return NextResponse.json({
      success: true,
      message: `Matchday ${matchday} frozen successfully`,
      frozenMatches: incompleteMatches.length,
      totalMatches: matches.length
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
