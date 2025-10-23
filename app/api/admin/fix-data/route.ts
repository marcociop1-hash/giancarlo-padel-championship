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
    console.log('=== RIPRISTINO DATI CORRETTI ===');
    
    const db = adminDb();
    
    // Cancella tutto
    const matchesSnapshot = await db.collection('matches').get();
    for (const doc of matchesSnapshot.docs) {
      await doc.ref.delete();
    }
    
    // Giornata 1 - Dati reali
    const match1 = {
      teamA: [{ id: 'mROGpeLuw8ZoMSufBqnZQXv6LfG3', name: 'Bobo' }, { id: 'zQiZF6rhjWP6aPKpkRULB6Rm8Zu2', name: 'TommiT' }],
      teamB: [{ id: 'gS2BwITb0oPondVMxuocRGWAMzY2', name: 'Leo' }, { id: 'hJrVGFN8AEa2qybkS78KXRgIfIj2', name: 'Mattia' }],
      scoreA: 3, scoreB: 0, matchday: 1, phase: 'campionato', status: 'completed',
      set1Games: [6,1], set2Games: [6,2], set3Games: [6,2], totalGamesA: 18, totalGamesB: 5,
      date: '2024-01-15', time: '10:00', place: 'Campo 1'
    };
    
    const match2 = {
      teamA: [{ id: '0CAzj8vXLRMS3e613OU5SX7Ffhz2', name: 'Nico' }, { id: '0MSgLaecBwaVQUT6LeUDGZKLCgD3', name: 'Dani' }],
      teamB: [{ id: '0qiCrEVP4nQhNqF2nOmRAqOhZQD2', name: 'Matte' }, { id: 'Bu1ukLYnOOPWJo5U4VeClLePvm62', name: 'TommyB' }],
      scoreA: 2, scoreB: 1, matchday: 1, phase: 'campionato', status: 'completed',
      set1Games: [5,7], set2Games: [6,2], set3Games: [6,2], totalGamesA: 17, totalGamesB: 11,
      date: '2024-01-15', time: '11:00', place: 'Campo 2'
    };
    
    const match3 = {
      teamA: [{ id: 'PSDBs6SUBtb0JeI4FEbRuhjJTp12', name: 'Ivan' }, { id: 'OUB9AOkmYacMWyZ5rIoh3fe5pX63', name: 'Gianlu' }],
      teamB: [{ id: 'WtyMtQmtWbckKi2lS5xaYnWRkFt1', name: 'Magro' }, { id: 'TpCgepA37mdi6acwdVe9t7e3yS82', name: 'Checco' }],
      scoreA: 1, scoreB: 2, matchday: 1, phase: 'campionato', status: 'completed',
      set1Games: [6,1], set2Games: [0,6], set3Games: [4,6], totalGamesA: 10, totalGamesB: 13,
      date: '2024-01-15', time: '12:00', place: 'Campo 1'
    };
    
    const match4 = {
      teamA: [{ id: 'f5XD4GdjlvToj6QV8WPy296MqMD3', name: 'Marco' }, { id: 'fHDGiCoP3oOi5ZQTC5P6mQe3I9a2', name: 'Giacomo' }],
      teamB: [{ id: 'eAJlxs9S5UR7N1TpXmtBwljUe3n2', name: 'Gabri' }, { id: 'YYO4AZiqgec8k3l2OsQOTzns6Qv2', name: 'Gelli' }],
      scoreA: 2, scoreB: 1, matchday: 1, phase: 'campionato', status: 'completed',
      set1Games: [6,2], set2Games: [3,6], set3Games: [7,6], totalGamesA: 16, totalGamesB: 14,
      date: '2024-01-15', time: '13:00', place: 'Campo 2'
    };
    
    // Giornata 2 - Dati reali
    const match5 = {
      teamA: [{ id: 'f5XD4GdjlvToj6QV8WPy296MqMD3', name: 'Marco' }, { id: 'YYO4AZiqgec8k3l2OsQOTzns6Qv2', name: 'Gelli' }],
      teamB: [{ id: 'fHDGiCoP3oOi5ZQTC5P6mQe3I9a2', name: 'Giacomo' }, { id: 'eAJlxs9S5UR7N1TpXmtBwljUe3n2', name: 'Gabri' }],
      scoreA: 3, scoreB: 0, matchday: 2, phase: 'campionato', status: 'completed',
      set1Games: [6,4], set2Games: [6,4], set3Games: [6,2], totalGamesA: 18, totalGamesB: 10,
      date: '2024-01-22', time: '10:00', place: 'Campo 1'
    };
    
    const match6 = {
      teamA: [{ id: 'zQiZF6rhjWP6aPKpkRULB6Rm8Zu2', name: 'TommiT' }, { id: 'hJrVGFN8AEa2qybkS78KXRgIfIj2', name: 'Mattia' }],
      teamB: [{ id: 'gS2BwITb0oPondVMxuocRGWAMzY2', name: 'Leo' }, { id: 'mROGpeLuw8ZoMSufBqnZQXv6LfG3', name: 'Bobo' }],
      scoreA: 2, scoreB: 1, matchday: 2, phase: 'campionato', status: 'completed',
      set1Games: [4,6], set2Games: [6,2], set3Games: [6,2], totalGamesA: 16, totalGamesB: 10,
      date: '2024-01-22', time: '11:00', place: 'Campo 2'
    };
    
    const match7 = {
      teamA: [{ id: '0qiCrEVP4nQhNqF2nOmRAqOhZQD2', name: 'Matte' }, { id: '0CAzj8vXLRMS3e613OU5SX7Ffhz2', name: 'Nico' }],
      teamB: [{ id: 'Bu1ukLYnOOPWJo5U4VeClLePvm62', name: 'TommyB' }, { id: '0MSgLaecBwaVQUT6LeUDGZKLCgD3', name: 'Dani' }],
      scoreA: 3, scoreB: 0, matchday: 2, phase: 'campionato', status: 'completed',
      set1Games: [6,2], set2Games: [6,4], set3Games: [6,1], totalGamesA: 18, totalGamesB: 7,
      date: '2024-01-22', time: '12:00', place: 'Campo 1'
    };
    
    const match8 = {
      teamA: [{ id: 'TpCgepA37mdi6acwdVe9t7e3yS82', name: 'Checco' }, { id: 'OUB9AOkmYacMWyZ5rIoh3fe5pX63', name: 'Gianlu' }],
      teamB: [{ id: 'WtyMtQmtWbckKi2lS5xaYnWRkFt1', name: 'Magro' }, { id: 'PSDBs6SUBtb0JeI4FEbRuhjJTp12', name: 'Ivan' }],
      scoreA: 3, scoreB: 0, matchday: 2, phase: 'campionato', status: 'completed',
      set1Games: [6,2], set2Games: [6,0], set3Games: [6,2], totalGamesA: 18, totalGamesB: 4,
      date: '2024-01-22', time: '13:00', place: 'Campo 2'
    };
    
    const matches = [match1, match2, match3, match4, match5, match6, match7, match8];
    
    for (const match of matches) {
      await db.collection('matches').add({
        ...match,
        createdAt: new Date(),
        completedAt: new Date()
      });
    }
    
    return NextResponse.json({
      ok: true,
      message: '8 partite ripristinate con dati corretti',
      created: 8
    });
    
  } catch (error: any) {
    console.error("ERRORE:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
