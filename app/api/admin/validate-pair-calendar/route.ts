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
    const db = adminDb();
    
    // Ottieni il calendario dal database
    const calendarDoc = await db.collection('pair_calendar').doc('calendar').get();
    
    if (!calendarDoc.exists) {
      return NextResponse.json({
        ok: false,
        message: 'Calendario non trovato. Genera prima il calendario delle coppie.',
        isValid: false
      });
    }
    
    const calendarData = calendarDoc.data();
    const calendar = calendarData?.calendar || [];
    
    // Verifica accoppiamenti ripetuti
    const usedPairs = new Set<string>();
    const repeatedPairs: any[] = [];
    
    for (const day of calendar) {
      for (const pair of day.pairs) {
        if (Array.isArray(pair.teamA) && Array.isArray(pair.teamB)) {
          // Crea chiavi per le coppie
          const pairA = pair.teamA.map(p => p.id).sort().join('-');
          const pairB = pair.teamB.map(p => p.id).sort().join('-');
          
          // Verifica se le coppie sono già state usate
          if (usedPairs.has(pairA)) {
            repeatedPairs.push({
              day: day.day,
              pair: pairA,
              players: pair.teamA.map(p => p.name).join(' + ')
            });
          } else {
            usedPairs.add(pairA);
          }
          
          if (usedPairs.has(pairB)) {
            repeatedPairs.push({
              day: day.day,
              pair: pairB,
              players: pair.teamB.map(p => p.name).join(' + ')
            });
          } else {
            usedPairs.add(pairB);
          }
        }
      }
    }
    
    const isValid = repeatedPairs.length === 0;
    
    return NextResponse.json({
      ok: true,
      isValid,
      totalDays: calendar.length,
      totalPairs: usedPairs.size,
      repeatedPairs,
      message: isValid 
        ? `✅ Calendario valido! ${calendar.length} giornate, ${usedPairs.size} coppie uniche.`
        : `❌ Calendario non valido! Trovate ${repeatedPairs.length} coppie ripetute.`
    });
    
  } catch (error: any) {
    console.error("ERRORE /api/admin/validate-pair-calendar:", error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}
