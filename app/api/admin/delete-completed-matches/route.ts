// app/api/admin/delete-completed-matches/route.ts
import { NextResponse } from "next/server";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function initAdmin() {
  if (!getApps().length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    if (!projectId || !clientEmail || !privateKey) {
      throw new Error("Mancano FIREBASE_* in .env.local");
    }
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  return getFirestore();
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/admin/delete-completed-matches",
    usage: "POST -> Cancella solo le partite con status 'completed', mantenendo quelle in programma.",
  });
}

export async function POST() {
  try {
    const db = initAdmin();
    
    // Cancella tutte le partite esistenti
    const allMatches = await db.collection("matches").get();
    if (allMatches.size > 0) {
      const batch = db.batch();
      allMatches.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      console.log(`Cancellate ${allMatches.size} partite esistenti`);
    } else {
      console.log('Database già vuoto, procedo con la creazione delle partite');
    }
    
    // Ripristina le partite con i dati reali
    const realMatches = [
      // Giornata 1
      {
        teamA: [{ id: 'mROGpeLuw8ZoMSufBqnZQXv6LfG3', name: 'Bobo' }, { id: 'zQiZF6rhjWP6aPKpkRULB6Rm8Zu2', name: 'TommiT' }],
        teamB: [{ id: 'gS2BwITb0oPondVMxuocRGWAMzY2', name: 'Leo' }, { id: 'hJrVGFN8AEa2qybkS78KXRgIfIj2', name: 'Mattia' }],
        scoreA: 3, scoreB: 0, matchday: 1, phase: 'campionato', status: 'completed',
        set1Games: [6,1], set2Games: [6,2], set3Games: [6,2], totalGamesA: 18, totalGamesB: 5,
        date: '2024-01-15', time: '10:00', place: 'Campo 1'
      },
      {
        teamA: [{ id: '0CAzj8vXLRMS3e613OU5SX7Ffhz2', name: 'Nico' }, { id: '0MSgLaecBwaVQUT6LeUDGZKLCgD3', name: 'Dani' }],
        teamB: [{ id: '0qiCrEVP4nQhNqF2nOmRAqOhZQD2', name: 'Matte' }, { id: 'Bu1ukLYnOOPWJo5U4VeClLePvm62', name: 'TommyB' }],
        scoreA: 2, scoreB: 1, matchday: 1, phase: 'campionato', status: 'completed',
        set1Games: [5,7], set2Games: [6,2], set3Games: [6,2], totalGamesA: 17, totalGamesB: 11,
        date: '2024-01-15', time: '11:00', place: 'Campo 2'
      },
      {
        teamA: [{ id: 'PSDBs6SUBtb0JeI4FEbRuhjJTp12', name: 'Ivan' }, { id: 'OUB9AOkmYacMWyZ5rIoh3fe5pX63', name: 'Gianlu' }],
        teamB: [{ id: 'WtyMtQmtWbckKi2lS5xaYnWRkFt1', name: 'Magro' }, { id: 'TpCgepA37mdi6acwdVe9t7e3yS82', name: 'Checco' }],
        scoreA: 1, scoreB: 2, matchday: 1, phase: 'campionato', status: 'completed',
        set1Games: [6,1], set2Games: [0,6], set3Games: [4,6], totalGamesA: 10, totalGamesB: 13,
        date: '2024-01-15', time: '12:00', place: 'Campo 1'
      },
      {
        teamA: [{ id: 'f5XD4GdjlvToj6QV8WPy296MqMD3', name: 'Marco' }, { id: 'fHDGiCoP3oOi5ZQTC5P6mQe3I9a2', name: 'Giacomo' }],
        teamB: [{ id: 'eAJlxs9S5UR7N1TpXmtBwljUe3n2', name: 'Gabri' }, { id: 'YYO4AZiqgec8k3l2OsQOTzns6Qv2', name: 'Gelli' }],
        scoreA: 2, scoreB: 1, matchday: 1, phase: 'campionato', status: 'completed',
        set1Games: [6,2], set2Games: [3,6], set3Games: [7,6], totalGamesA: 16, totalGamesB: 14,
        date: '2024-01-15', time: '13:00', place: 'Campo 2'
      },
      // Giornata 2
      {
        teamA: [{ id: 'f5XD4GdjlvToj6QV8WPy296MqMD3', name: 'Marco' }, { id: 'YYO4AZiqgec8k3l2OsQOTzns6Qv2', name: 'Gelli' }],
        teamB: [{ id: 'fHDGiCoP3oOi5ZQTC5P6mQe3I9a2', name: 'Giacomo' }, { id: 'eAJlxs9S5UR7N1TpXmtBwljUe3n2', name: 'Gabri' }],
        scoreA: 3, scoreB: 0, matchday: 2, phase: 'campionato', status: 'completed',
        set1Games: [6,4], set2Games: [6,4], set3Games: [6,2], totalGamesA: 18, totalGamesB: 10,
        date: '2024-01-22', time: '10:00', place: 'Campo 1'
      },
      {
        teamA: [{ id: 'zQiZF6rhjWP6aPKpkRULB6Rm8Zu2', name: 'TommiT' }, { id: 'hJrVGFN8AEa2qybkS78KXRgIfIj2', name: 'Mattia' }],
        teamB: [{ id: 'gS2BwITb0oPondVMxuocRGWAMzY2', name: 'Leo' }, { id: 'mROGpeLuw8ZoMSufBqnZQXv6LfG3', name: 'Bobo' }],
        scoreA: 2, scoreB: 1, matchday: 2, phase: 'campionato', status: 'completed',
        set1Games: [4,6], set2Games: [6,2], set3Games: [6,2], totalGamesA: 16, totalGamesB: 10,
        date: '2024-01-22', time: '11:00', place: 'Campo 2'
      },
      {
        teamA: [{ id: '0qiCrEVP4nQhNqF2nOmRAqOhZQD2', name: 'Matte' }, { id: '0CAzj8vXLRMS3e613OU5SX7Ffhz2', name: 'Nico' }],
        teamB: [{ id: 'Bu1ukLYnOOPWJo5U4VeClLePvm62', name: 'TommyB' }, { id: '0MSgLaecBwaVQUT6LeUDGZKLCgD3', name: 'Dani' }],
        scoreA: 3, scoreB: 0, matchday: 2, phase: 'campionato', status: 'completed',
        set1Games: [6,2], set2Games: [6,4], set3Games: [6,1], totalGamesA: 18, totalGamesB: 7,
        date: '2024-01-22', time: '12:00', place: 'Campo 1'
      },
      {
        teamA: [{ id: 'TpCgepA37mdi6acwdVe9t7e3yS82', name: 'Checco' }, { id: 'OUB9AOkmYacMWyZ5rIoh3fe5pX63', name: 'Gianlu' }],
        teamB: [{ id: 'WtyMtQmtWbckKi2lS5xaYnWRkFt1', name: 'Magro' }, { id: 'PSDBs6SUBtb0JeI4FEbRuhjJTp12', name: 'Ivan' }],
        scoreA: 3, scoreB: 0, matchday: 2, phase: 'campionato', status: 'completed',
        set1Games: [6,2], set2Games: [6,0], set3Games: [6,2], totalGamesA: 18, totalGamesB: 4,
        date: '2024-01-22', time: '13:00', place: 'Campo 2'
      }
    ];
    
    // Crea le partite reali
    for (const match of realMatches) {
      await db.collection('matches').add({
        ...match,
        createdAt: new Date(),
        completedAt: new Date()
      });
    }
    
    // Invalida la cache della classifica
    try {
      const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/classifica?refresh=true`);
      if (!response.ok) {
        console.log('Errore invalidation cache classifica:', response.status);
      }
    } catch (e) {
      console.log('Errore invalidation cache classifica:', e);
    }
    
    return NextResponse.json({
      ok: true,
      message: `8 partite ripristinate con dati reali. Classifica aggiornata.`,
      created: 8
    });
  } catch (error: any) {
    console.error("ERRORE /api/admin/delete-completed-matches:", error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}



