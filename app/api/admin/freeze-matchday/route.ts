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

    // Aggiorna tutte le partite incomplete della giornata a "da recuperare"
    const batch = db.batch();
    const incompleteMatches = targetMatches.filter((m: any) => m.status !== 'completata');

    if (incompleteMatches.length === 0) {
      return NextResponse.json({ 
        error: 'Matchday cannot be frozen - all matches are completed' 
      }, { status: 400 });
    }

    incompleteMatches.forEach((match: any) => {
      const matchRef = db.collection('matches').doc(match.id);
      batch.update(matchRef, {
        status: 'da recuperare',
        frozenAt: new Date(),
        originalMatchday: matchday
      });
    });

    await batch.commit();

    return NextResponse.json({
      success: true,
      message: `Matchday ${matchday} frozen successfully`,
      frozenMatches: incompleteMatches.length,
      totalMatches: targetMatches.length
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
