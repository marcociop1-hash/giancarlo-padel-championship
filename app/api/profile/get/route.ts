import { NextResponse } from "next/server";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

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

export async function GET(request: Request) {
  try {
    // Ottieni il token di autenticazione dall'header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ 
        error: 'Token di autenticazione mancante' 
      }, { status: 401 });
    }

    const idToken = authHeader.substring(7);
    
    // Verifica il token con Firebase Admin
    const auth = getAuth();
    const decodedToken = await auth.verifyIdToken(idToken);
    const userId = decodedToken.uid;

    // Carica il profilo utente da Firestore
    const db = adminDb();
    const userDoc = await db.collection('players').doc(userId).get();
    
    if (!userDoc.exists) {
      return NextResponse.json({
        success: true,
        user: {
          id: userId,
          email: decodedToken.email
        }
      });
    }

    const userData = userDoc.data();
    
    return NextResponse.json({
      success: true,
      user: {
        id: userId,
        email: decodedToken.email,
        ...userData
      }
    });
    
  } catch (error: any) {
    console.error("[API] ❌ ERRORE /api/profile/get:", error);
    return NextResponse.json({ 
      error: error.message || "Errore nel caricamento del profilo" 
    }, { status: 500 });
  }
}

