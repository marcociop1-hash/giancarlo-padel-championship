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
    console.log('Testing Firebase connection...');
    
    const db = adminDb();
    console.log('Firebase initialized successfully');
    
    // Test simple read
    const matchesRef = db.collection('matches');
    const snapshot = await matchesRef.limit(1).get();
    
    console.log('Firebase read test successful');
    
    return NextResponse.json({
      success: true,
      message: "Firebase connection test successful",
      matchesCount: snapshot.size,
      environment: {
        hasProjectId: !!process.env.FIREBASE_PROJECT_ID,
        hasClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
        hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
        projectId: process.env.FIREBASE_PROJECT_ID
      }
    });
  } catch (error: any) {
    console.error('Firebase connection test failed:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack,
      environment: {
        hasProjectId: !!process.env.FIREBASE_PROJECT_ID,
        hasClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
        hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
        projectId: process.env.FIREBASE_PROJECT_ID
      }
    }, { status: 500 });
  }
}
