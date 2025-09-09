import { NextResponse } from "next/server";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function adminDb() {
  if (!getApps().length) {
    const projectId = process.env.FIREBASE_PROJECT_ID!;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL!;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n');
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  return getFirestore();
}

export async function POST() {
  try {
    const db = adminDb();
    
    // Ottieni tutte le partite del campionato
    const matchesSnapshot = await db.collection('matches')
      .where('phase', '==', 'campionato')
      .get();

    if (matchesSnapshot.empty) {
      return NextResponse.json({ error: 'No championship matches found' }, { status: 404 });
    }

    const matches = matchesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
    
    // Raggruppa le partite per giornata (usando il campo giornata o createdAt)
    const matchesByGiornata = new Map<number, any[]>();
    
    matches.forEach(match => {
      // Usa il campo giornata se disponibile, altrimenti createdAt
      const giornataKey = match.giornata || match.createdAt?.toMillis() || 0;
      
      if (!matchesByGiornata.has(giornataKey)) {
        matchesByGiornata.set(giornataKey, []);
      }
      matchesByGiornata.get(giornataKey)!.push(match);
    });

    // Ordina le giornate per timestamp
    const sortedGiornate = Array.from(matchesByGiornata.keys()).sort((a, b) => a - b);
    
    console.log(`Found ${sortedGiornate.length} giornate:`, sortedGiornate);

    // Assegna i matchday corretti
    const batch = db.batch();
    let totalUpdated = 0;

    sortedGiornate.forEach((giornataKey, index) => {
      const matchday = index + 1;
      const matchesInGiornata = matchesByGiornata.get(giornataKey)!;
      
      console.log(`Giornata ${matchday}: ${matchesInGiornata.length} partite`);
      
      matchesInGiornata.forEach(match => {
        // Aggiorna solo se il matchday è diverso
        if (match.matchday !== matchday) {
          const matchRef = db.collection('matches').doc(match.id);
          batch.update(matchRef, { matchday: matchday });
          totalUpdated++;
        }
      });
    });

    if (totalUpdated > 0) {
      await batch.commit();
    }

    return NextResponse.json({
      success: true,
      message: `Fixed matchdays for ${totalUpdated} matches`,
      totalMatches: matches.length,
      totalGiornate: sortedGiornate.length,
      updatedMatches: totalUpdated
    });

  } catch (error) {
    console.error('Error fixing matchdays:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: "Use POST method to fix matchdays",
    usage: "POST to this endpoint to fix matchday assignments"
  });
}
