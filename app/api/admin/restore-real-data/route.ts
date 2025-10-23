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
    console.log('=== RIPRISTINO DATI REALI INIZIATO ===');
    
    const db = adminDb();
    
    // 1. Cancella tutte le partite attuali
    const matchesSnapshot = await db.collection('matches').get();
    console.log(`Cancellando ${matchesSnapshot.docs.length} partite esistenti...`);
    
    for (const doc of matchesSnapshot.docs) {
      await doc.ref.delete();
    }
    
    // 2. Ripristina le partite reali della giornata 1
    const matchday1Matches = [
      {
        teamA: [
          { id: 'mROGpeLuw8ZoMSufBqnZQXv6LfG3', name: 'Bobo' },
          { id: 'zQiZF6rhjWP6aPKpkRULB6Rm8Zu2', name: 'TommiT' }
        ],
        teamB: [
          { id: 'gS2BwITb0oPondVMxuocRGWAMzY2', name: 'Leo' },
          { id: 'hJrVGFN8AEa2qybkS78KXRgIfIj2', name: 'Mattia' }
        ],
        scoreA: 3, // Bobo+TommiT vincono 3-0
        scoreB: 0,
        set1Games: [6, 1],
        set2Games: [6, 2],
        set3Games: [6, 2],
        totalGamesA: 18,
        totalGamesB: 5,
        matchday: 1,
        phase: 'campionato',
        status: 'completed',
        date: '2024-01-15',
        time: '10:00',
        place: 'Campo 1'
      },
      {
        teamA: [
          { id: '0CAzj8vXLRMS3e613OU5SX7Ffhz2', name: 'Nico' },
          { id: '0MSgLaecBwaVQUT6LeUDGZKLCgD3', name: 'Dani' }
        ],
        teamB: [
          { id: '0qiCrEVP4nQhNqF2nOmRAqOhZQD2', name: 'Matte' },
          { id: 'Bu1ukLYnOOPWJo5U4VeClLePvm62', name: 'TommyB' }
        ],
        scoreA: 2, // Nico+Dani vincono 2-1
        scoreB: 1,
        set1Games: [5, 7],
        set2Games: [6, 2],
        set3Games: [6, 2],
        totalGamesA: 17,
        totalGamesB: 11,
        matchday: 1,
        phase: 'campionato',
        status: 'completed',
        date: '2024-01-15',
        time: '11:00',
        place: 'Campo 2'
      },
      {
        teamA: [
          { id: 'PSDBs6SUBtb0JeI4FEbRuhjJTp12', name: 'Ivan' },
          { id: 'OUB9AOkmYacMWyZ5rIoh3fe5pX63', name: 'Gianlu' }
        ],
        teamB: [
          { id: 'WtyMtQmtWbckKi2lS5xaYnWRkFt1', name: 'Magro' },
          { id: 'TpCgepA37mdi6acwdVe9t7e3yS82', name: 'Checco' }
        ],
        scoreA: 1, // Ivan+Gianlu perdono 1-2
        scoreB: 2,
        set1Games: [6, 1],
        set2Games: [0, 6],
        set3Games: [4, 6],
        totalGamesA: 10,
        totalGamesB: 13,
        matchday: 1,
        phase: 'campionato',
        status: 'completed',
        date: '2024-01-15',
        time: '12:00',
        place: 'Campo 1'
      },
      {
        teamA: [
          { id: 'f5XD4GdjlvToj6QV8WPy296MqMD3', name: 'Marco' },
          { id: 'fHDGiCoP3oOi5ZQTC5P6mQe3I9a2', name: 'Giacomo' }
        ],
        teamB: [
          { id: 'eAJlxs9S5UR7N1TpXmtBwljUe3n2', name: 'Gabri' },
          { id: 'YYO4AZiqgec8k3l2OsQOTzns6Qv2', name: 'Gelli' }
        ],
        scoreA: 2, // Marco+Giacomo vincono 2-1
        scoreB: 1,
        set1Games: [6, 2],
        set2Games: [3, 6],
        set3Games: [7, 6],
        totalGamesA: 16,
        totalGamesB: 14,
        matchday: 1,
        phase: 'campionato',
        status: 'completed',
        date: '2024-01-15',
        time: '13:00',
        place: 'Campo 2'
      }
    ];

    // 3. Ripristina le partite reali della giornata 2
    const matchday2Matches = [
      {
        teamA: [
          { id: 'f5XD4GdjlvToj6QV8WPy296MqMD3', name: 'Marco' },
          { id: 'YYO4AZiqgec8k3l2OsQOTzns6Qv2', name: 'Gelli' }
        ],
        teamB: [
          { id: 'fHDGiCoP3oOi5ZQTC5P6mQe3I9a2', name: 'Giacomo' },
          { id: 'eAJlxs9S5UR7N1TpXmtBwljUe3n2', name: 'Gabri' }
        ],
        scoreA: 3, // Marco+Gelli vincono 3-0
        scoreB: 0,
        set1Games: [6, 4],
        set2Games: [6, 4],
        set3Games: [6, 2],
        totalGamesA: 18,
        totalGamesB: 10,
        matchday: 2,
        phase: 'campionato',
        status: 'completed',
        date: '2024-01-22',
        time: '10:00',
        place: 'Campo 1'
      },
      {
        teamA: [
          { id: 'zQiZF6rhjWP6aPKpkRULB6Rm8Zu2', name: 'TommiT' },
          { id: 'hJrVGFN8AEa2qybkS78KXRgIfIj2', name: 'Mattia' }
        ],
        teamB: [
          { id: 'gS2BwITb0oPondVMxuocRGWAMzY2', name: 'Leo' },
          { id: 'mROGpeLuw8ZoMSufBqnZQXv6LfG3', name: 'Bobo' }
        ],
        scoreA: 2, // TommiT+Mattia vincono 2-1
        scoreB: 1,
        set1Games: [4, 6],
        set2Games: [6, 2],
        set3Games: [6, 2],
        totalGamesA: 16,
        totalGamesB: 10,
        matchday: 2,
        phase: 'campionato',
        status: 'completed',
        date: '2024-01-22',
        time: '11:00',
        place: 'Campo 2'
      },
      {
        teamA: [
          { id: '0qiCrEVP4nQhNqF2nOmRAqOhZQD2', name: 'Matte' },
          { id: '0CAzj8vXLRMS3e613OU5SX7Ffhz2', name: 'Nico' }
        ],
        teamB: [
          { id: 'Bu1ukLYnOOPWJo5U4VeClLePvm62', name: 'TommyB' },
          { id: '0MSgLaecBwaVQUT6LeUDGZKLCgD3', name: 'Dani' }
        ],
        scoreA: 3, // Matte+Nico vincono 3-0
        scoreB: 0,
        set1Games: [6, 2],
        set2Games: [6, 4],
        set3Games: [6, 1],
        totalGamesA: 18,
        totalGamesB: 7,
        matchday: 2,
        phase: 'campionato',
        status: 'completed',
        date: '2024-01-22',
        time: '12:00',
        place: 'Campo 1'
      },
      {
        teamA: [
          { id: 'TpCgepA37mdi6acwdVe9t7e3yS82', name: 'Checco' },
          { id: 'OUB9AOkmYacMWyZ5rIoh3fe5pX63', name: 'Gianlu' }
        ],
        teamB: [
          { id: 'WtyMtQmtWbckKi2lS5xaYnWRkFt1', name: 'Magro' },
          { id: 'PSDBs6SUBtb0JeI4FEbRuhjJTp12', name: 'Ivan' }
        ],
        scoreA: 3, // Checco+Gianlu vincono 3-0
        scoreB: 0,
        set1Games: [6, 2],
        set2Games: [6, 0],
        set3Games: [6, 2],
        totalGamesA: 18,
        totalGamesB: 4,
        matchday: 2,
        phase: 'campionato',
        status: 'completed',
        date: '2024-01-22',
        time: '13:00',
        place: 'Campo 2'
      }
    ];

    // Crea le partite della giornata 1
    let createdCount = 0;
    for (const match of matchday1Matches) {
      const matchData = {
        ...match,
        createdAt: new Date(),
        completedAt: new Date()
      };
      
      await db.collection('matches').add(matchData);
      createdCount++;
      console.log(`Creata partita giornata 1: ${match.teamA.map(p => p.name).join(' & ')} vs ${match.teamB.map(p => p.name).join(' & ')} (${match.scoreA}-${match.scoreB})`);
    }

    // Crea le partite della giornata 2
    for (const match of matchday2Matches) {
      const matchData = {
        ...match,
        createdAt: new Date(),
        completedAt: new Date()
      };
      
      await db.collection('matches').add(matchData);
      createdCount++;
      console.log(`Creata partita giornata 2: ${match.teamA.map(p => p.name).join(' & ')} vs ${match.teamB.map(p => p.name).join(' & ')} (${match.scoreA}-${match.scoreB})`);
    }
    
    console.log(`=== RIPRISTINO COMPLETATO: ${createdCount} partite create ===`);
    
    return NextResponse.json({
      ok: true,
      message: `${createdCount} partite reali ripristinate`,
      created: createdCount
    });
  } catch (error: any) {
    console.error("ERRORE /api/admin/restore-real-data:", error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}
