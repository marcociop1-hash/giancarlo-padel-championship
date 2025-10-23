import { NextResponse } from "next/server";
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    console.log('=== RIPRISTINO DA BACKUP INIZIATO ===');
    
    const db = adminDb();
    
    // 1. Cancella tutte le partite attuali
    const matchesSnapshot = await db.collection('matches').get();
    console.log(`Cancellando ${matchesSnapshot.docs.length} partite esistenti...`);
    
    for (const doc of matchesSnapshot.docs) {
      await doc.ref.delete();
    }
    
    // 2. Controlla se ci sono backup delle partite originali
    // Il sistema potrebbe aver salvato i dati originali quando le partite sono state congelate
    const backupSnapshot = await db.collection('standings_backup').get();
    console.log(`Trovati ${backupSnapshot.docs.length} backup di classifiche`);
    
    // 3. Cerca partite con dati originali salvati
    const allMatchesSnapshot = await db.collection('matches').get();
    const matchesWithOriginalData = allMatchesSnapshot.docs.filter(doc => {
      const data = doc.data();
      return data.originalData && data.originalData.scoreA !== undefined;
    });
    
    console.log(`Trovate ${matchesWithOriginalData.length} partite con dati originali`);
    
    if (matchesWithOriginalData.length > 0) {
      // Ripristina le partite con i dati originali
      let restoredCount = 0;
      
      for (const doc of matchesWithOriginalData) {
        const match = doc.data();
        const originalData = match.originalData;
        
        if (originalData && originalData.scoreA !== undefined) {
          // Crea una nuova partita con i dati originali
          const restoredMatch = {
            teamA: match.teamA,
            teamB: match.teamB,
            scoreA: originalData.scoreA,
            scoreB: originalData.scoreB,
            totalGamesA: originalData.totalGamesA,
            totalGamesB: originalData.totalGamesB,
            set1Games: originalData.set1Games,
            set2Games: originalData.set2Games,
            set3Games: originalData.set3Games,
            matchday: match.originalMatchday || match.matchday,
            phase: 'campionato',
            status: 'completed',
            date: match.date,
            time: match.time,
            place: match.place,
            completedBy: originalData.completedBy,
            completedAt: originalData.completedAt,
            confirmedBy: originalData.confirmedBy,
            confirmedAt: originalData.confirmedAt,
            restoredAt: new Date()
          };
          
          await db.collection('matches').add(restoredMatch);
          restoredCount++;
          
          console.log(`Ripristinata partita: ${restoredMatch.teamA?.map((p: any) => p.name).join(' & ')} vs ${restoredMatch.teamB?.map((p: any) => p.name).join(' & ')} (${restoredMatch.scoreA}-${restoredMatch.scoreB})`);
        }
      }
      
      console.log(`=== RIPRISTINO COMPLETATO: ${restoredCount} partite ripristinate dai backup ===`);
      
      return NextResponse.json({
        ok: true,
        message: `${restoredCount} partite ripristinate dai backup`,
        restored: restoredCount
      });
    } else {
      console.log('❌ Nessun backup di partite trovato');
      
      return NextResponse.json({
        ok: false,
        message: 'Nessun backup di partite trovato',
        restored: 0
      });
    }
    
  } catch (error: any) {
    console.error("ERRORE /api/admin/restore-from-backup:", error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}
