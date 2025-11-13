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
        calendar: null
      });
    }
    
    const calendarData = calendarDoc.data();
    
    return NextResponse.json({
      ok: true,
      calendar: calendarData?.calendar || [],
      totalDays: calendarData?.totalDays || 0,
      generatedAt: calendarData?.generatedAt,
      status: calendarData?.status
    });
    
  } catch (error: any) {
    console.error("ERRORE /api/admin/get-pair-calendar:", error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}

