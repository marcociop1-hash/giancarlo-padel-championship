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
    console.log('=== RIPRISTINO DATI ORIGINALI INIZIATO ===');
    
    const db = adminDb();
    
    // 1. Cancella tutte le partite attuali
    const matchesSnapshot = await db.collection('matches').get();
    console.log(`Cancellando ${matchesSnapshot.docs.length} partite esistenti...`);
    
    for (const doc of matchesSnapshot.docs) {
      await doc.ref.delete();
    }
    
    // 2. Ripristina le partite originali (basate sui dati che avevi prima)
    const originalMatches = [
      // Giornata 1
      {
        teamA: [
          { id: 'gS2BwITb0oPondVMxuocRGWAMzY2', name: 'Leo' },
          { id: 'mROGpeLuw8ZoMSufBqnZQXv6LfG3', name: 'Bobo' }
        ],
        teamB: [
          { id: 'zQiZF6rhjWP6aPKpkRULB6Rm8Zu2', name: 'TommiT' },
          { id: 'hJrVGFN8AEa2qybkS78KXRgIfIj2', name: 'Mattia' }
        ],
        scoreA: 3,
        scoreB: 0,
        matchday: 1,
        phase: 'campionato',
        status: 'completed',
        date: '2024-01-15',
        time: '10:00',
        place: 'Campo 1'
      },
      {
        teamA: [
          { id: 'OUB9AOkmYacMWyZ5rIoh3fe5pX63', name: 'Gianlu' },
          { id: 'TpCgepA37mdi6acwdVe9t7e3yS82', name: 'Checco' }
        ],
        teamB: [
          { id: 'PSDBs6SUBtb0JeI4FEbRuhjJTp12', name: 'Ivan' },
          { id: 'WtyMtQmtWbckKi2lS5xaYnWRkFt1', name: 'Magro' }
        ],
        scoreA: 2,
        scoreB: 1,
        matchday: 1,
        phase: 'campionato',
        status: 'completed',
        date: '2024-01-15',
        time: '11:00',
        place: 'Campo 2'
      },
      {
        teamA: [
          { id: '0CAzj8vXLRMS3e613OU5SX7Ffhz2', name: 'Nico' },
          { id: '0qiCrEVP4nQhNqF2nOmRAqOhZQD2', name: 'Matte' }
        ],
        teamB: [
          { id: '0MSgLaecBwaVQUT6LeUDGZKLCgD3', name: 'Dani' },
          { id: 'Bu1ukLYnOOPWJo5U4VeClLePvm62', name: 'TommyB' }
        ],
        scoreA: 2, // CORRETTO: 2-1 invece di 3-0
        scoreB: 1,
        matchday: 1,
        phase: 'campionato',
        status: 'completed',
        date: '2024-01-15',
        time: '12:00',
        place: 'Campo 1'
      },
      {
        teamA: [
          { id: 'YYO4AZiqgec8k3l2OsQOTzns6Qv2', name: 'Gelli' },
          { id: 'eAJlxs9S5UR7N1TpXmtBwljUe3n2', name: 'Gabri' }
        ],
        teamB: [
          { id: 'f5XD4GdjlvToj6QV8WPy296MqMD3', name: 'Marco' },
          { id: 'fHDGiCoP3oOi5ZQTC5P6mQe3I9a2', name: 'Giacomo' }
        ],
        scoreA: 1,
        scoreB: 2,
        matchday: 1,
        phase: 'campionato',
        status: 'completed',
        date: '2024-01-15',
        time: '13:00',
        place: 'Campo 2'
      },
      // Giornata 2
      {
        teamA: [
          { id: 'YYO4AZiqgec8k3l2OsQOTzns6Qv2', name: 'Gelli' },
          { id: 'f5XD4GdjlvToj6QV8WPy296MqMD3', name: 'Marco' }
        ],
        teamB: [
          { id: 'eAJlxs9S5UR7N1TpXmtBwljUe3n2', name: 'Gabri' },
          { id: 'fHDGiCoP3oOi5ZQTC5P6mQe3I9a2', name: 'Giacomo' }
        ],
        scoreA: 3,
        scoreB: 0,
        matchday: 2,
        phase: 'campionato',
        status: 'completed',
        date: '2024-01-22',
        time: '10:00',
        place: 'Campo 1'
      },
      {
        teamA: [
          { id: 'gS2BwITb0oPondVMxuocRGWAMzY2', name: 'Leo' },
          { id: 'mROGpeLuw8ZoMSufBqnZQXv6LfG3', name: 'Bobo' }
        ],
        teamB: [
          { id: 'hJrVGFN8AEa2qybkS78KXRgIfIj2', name: 'Mattia' },
          { id: 'zQiZF6rhjWP6aPKpkRULB6Rm8Zu2', name: 'TommiT' }
        ],
        scoreA: 1,
        scoreB: 2,
        matchday: 2,
        phase: 'campionato',
        status: 'completed',
        date: '2024-01-22',
        time: '11:00',
        place: 'Campo 2'
      },
      {
        teamA: [
          { id: 'OUB9AOkmYacMWyZ5rIoh3fe5pX63', name: 'Gianlu' },
          { id: 'TpCgepA37mdi6acwdVe9t7e3yS82', name: 'Checco' }
        ],
        teamB: [
          { id: 'PSDBs6SUBtb0JeI4FEbRuhjJTp12', name: 'Ivan' },
          { id: 'WtyMtQmtWbckKi2lS5xaYnWRkFt1', name: 'Magro' }
        ],
        scoreA: 3,
        scoreB: 0,
        matchday: 2,
        phase: 'campionato',
        status: 'completed',
        date: '2024-01-22',
        time: '12:00',
        place: 'Campo 1'
      },
      {
        teamA: [
          { id: '0CAzj8vXLRMS3e613OU5SX7Ffhz2', name: 'Nico' },
          { id: '0qiCrEVP4nQhNqF2nOmRAqOhZQD2', name: 'Matte' }
        ],
        teamB: [
          { id: '0MSgLaecBwaVQUT6LeUDGZKLCgD3', name: 'Dani' },
          { id: 'Bu1ukLYnOOPWJo5U4VeClLePvm62', name: 'TommyB' }
        ],
        scoreA: 3,
        scoreB: 0,
        matchday: 2,
        phase: 'campionato',
        status: 'completed',
        date: '2024-01-22',
        time: '13:00',
        place: 'Campo 2'
      }
    ];

    // Crea le partite originali
    let createdCount = 0;
    for (const match of originalMatches) {
      const matchData = {
        ...match,
        createdAt: new Date(),
        completedAt: new Date()
      };
      
      await db.collection('matches').add(matchData);
      createdCount++;
      console.log(`Creata partita: ${match.teamA.map(p => p.name).join(' & ')} vs ${match.teamB.map(p => p.name).join(' & ')} (${match.scoreA}-${match.scoreB})`);
    }
    
    console.log(`=== RIPRISTINO COMPLETATO: ${createdCount} partite create ===`);
    
    return NextResponse.json({
      ok: true,
      message: `${createdCount} partite originali ripristinate`,
      created: createdCount
    });
  } catch (error: any) {
    console.error("ERRORE /api/admin/restore-original-data:", error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}
