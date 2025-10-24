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
    const db = adminDb();
    
    // Cancella il calendario
    await db.collection('pair_calendar').doc('calendar').delete();
    
    return NextResponse.json({
      ok: true,
      message: "Calendario cancellato con successo!"
    });

  } catch (error: any) {
    console.error("ERRORE /api/admin/delete-pair-calendar:", error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}