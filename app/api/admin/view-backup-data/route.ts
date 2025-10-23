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

export async function GET() {
  try {
    console.log('=== VISUALIZZAZIONE DATI BACKUP ===');
    
    const db = adminDb();
    
    // 1. Controlla tutti i backup delle classifiche
    const backupSnapshot = await db.collection('standings_backup').get();
    console.log(`Trovati ${backupSnapshot.docs.length} backup di classifiche`);
    
    const backupData = [];
    for (const doc of backupSnapshot.docs) {
      const data = doc.data();
      backupData.push({
        id: doc.id,
        matchday: data.matchday,
        standings: data.standings,
        frozenAt: data.frozenAt,
        matchesCount: data.matchesCount,
        note: data.note
      });
    }
    
    // 2. Controlla se ci sono partite con dati originali
    const matchesSnapshot = await db.collection('matches').get();
    const matchesWithOriginalData = [];
    
    for (const doc of matchesSnapshot.docs) {
      const data = doc.data();
      if (data.originalData) {
        matchesWithOriginalData.push({
          id: doc.id,
          matchday: data.matchday,
          teamA: data.teamA,
          teamB: data.teamB,
          originalData: data.originalData,
          currentStatus: data.status
        });
      }
    }
    
    console.log(`Trovate ${matchesWithOriginalData.length} partite con dati originali`);
    
    return NextResponse.json({
      ok: true,
      message: 'Dati backup recuperati',
      backupCount: backupSnapshot.docs.length,
      matchesWithOriginalData: matchesWithOriginalData.length,
      backupData: backupData,
      matchesWithOriginalData: matchesWithOriginalData
    });
    
  } catch (error: any) {
    console.error("ERRORE /api/admin/view-backup-data:", error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}
