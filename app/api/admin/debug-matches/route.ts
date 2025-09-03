// app/api/admin/debug-matches/route.ts
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
    console.log('=== DEBUG PARTITE INIZIATO ===');
    
    const db = adminDb();
    const allMatches = await db.collection('matches').get();
    
    const matches = allMatches.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`Trovate ${matches.length} partite totali nel database`);
    
    // Debug dettagliato di ogni partita
    matches.forEach((match: any, index) => {
      console.log(`\n--- PARTITA ${index + 1} ---`);
      console.log(`ID: ${match.id}`);
      console.log(`Phase: ${match.phase || 'NON SPECIFICATO'}`);
      console.log(`Status: ${match.status || 'NON SPECIFICATO'}`);
      console.log(`Date: ${match.date || 'NON SPECIFICATO'}`);
      console.log(`Time: ${match.time || 'NON SPECIFICATO'}`);
      console.log(`Score: ${match.scoreA || 0} - ${match.scoreB || 0}`);
      console.log(`Team A:`, match.teamA?.map((p: any) => `${p.name} (${p.id})`) || 'VUOTO');
      console.log(`Team B:`, match.teamB?.map((p: any) => `${p.name} (${p.id})`) || 'VUOTO');
      console.log(`Place: ${match.place || 'NON SPECIFICATO'}`);
    });
    
    const completed = matches.filter((m: any) => m.status === 'completed');
    const withScores = matches.filter((m: any) => m.scoreA !== undefined && m.scoreB !== undefined);
    const incomplete = matches.filter((m: any) => m.status !== 'completed');
    const championship = matches.filter((m: any) => m.phase === 'campionato');
    
    console.log('\n=== STATISTICHE ===');
    console.log(`Totale: ${matches.length}`);
    console.log(`Completate (status): ${completed.length}`);
    console.log(`Completate (con punteggi): ${withScores.length}`);
    console.log(`Incomplete: ${incomplete.length}`);
    console.log(`Campionato: ${championship.length}`);
    
    // Debug delle partite completate del campionato
    const completedChampionship = matches.filter((m: any) => 
      m.status === 'completed' && m.phase === 'campionato'
    );
    
    console.log(`\n=== PARTITE COMPLETATE CAMPIONATO (${completedChampionship.length}) ===`);
    completedChampionship.forEach((match: any, index) => {
      console.log(`${index + 1}. ID: ${match.id}, Date: ${match.date}, Score: ${match.scoreA}-${match.scoreB}`);
      console.log(`   Team A: ${match.teamA?.map((p: any) => p.name).join(' & ')}`);
      console.log(`   Team B: ${match.teamB?.map((p: any) => p.name).join(' & ')}`);
    });
    
    console.log('=== DEBUG PARTITE COMPLETATO ===');
    
    return NextResponse.json({
      ok: true,
      message: 'Debug completato. Controlla la console.',
      stats: {
        total: matches.length,
        completed: completed.length,
        withScores: withScores.length,
        incomplete: incomplete.length,
        championship: championship.length,
        completedChampionship: completedChampionship.length
      },
      matches: matches.map((m: any) => ({
        id: m.id,
        phase: m.phase,
        status: m.status,
        date: m.date,
        score: `${m.scoreA || 0}-${m.scoreB || 0}`,
        teamA: m.teamA?.map((p: any) => p.name).join(' & '),
        teamB: m.teamB?.map((p: any) => p.name).join(' & ')
      }))
    });
  } catch (error: any) {
    console.error("ERRORE /api/admin/debug-matches:", error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}
