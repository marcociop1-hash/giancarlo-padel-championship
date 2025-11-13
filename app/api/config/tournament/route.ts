import { NextResponse } from "next/server";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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
    
    const configSnap = await db.collection('config').doc('tournament').get();
    const config = configSnap.exists ? configSnap.data() : {};
    
    return NextResponse.json({
      success: true,
      phase: config?.phase || 'campionato',
      ...config
    });
    
  } catch (error: any) {
    console.error("[API] ❌ ERRORE /api/config/tournament:", error);
    return NextResponse.json({ 
      success: true,
      phase: 'campionato' // Default in caso di errore
    });
  }
}

