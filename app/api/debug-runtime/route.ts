import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Verifica variabili Firebase Client
    const clientVars = {
      NEXT_PUBLIC_FIREBASE_API_KEY: {
        exists: !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        length: process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.length || 0,
        hasNewlines: process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.includes('\r\n') || process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.includes('\n'),
        startsWith: process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.substring(0, 15) || 'NOT_FOUND',
        endsWith: process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.substring(Math.max(0, (process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.length || 0) - 5)) || 'NOT_FOUND'
      },
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: {
        exists: !!process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        value: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'NOT_FOUND',
        length: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.length || 0,
        hasNewlines: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.includes('\r\n') || process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.includes('\n'),
        charCodes: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.split('').slice(-5).map(c => c.charCodeAt(0)) || []
      },
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: {
        exists: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        value: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'NOT_FOUND',
        length: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.length || 0,
        hasNewlines: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.includes('\r\n') || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.includes('\n')
      }
    };

    // Verifica variabili Firebase Admin
    const adminVars = {
      FIREBASE_PROJECT_ID: {
        exists: !!process.env.FIREBASE_PROJECT_ID,
        value: process.env.FIREBASE_PROJECT_ID || 'NOT_FOUND'
      },
      FIREBASE_CLIENT_EMAIL: {
        exists: !!process.env.FIREBASE_CLIENT_EMAIL,
        value: process.env.FIREBASE_CLIENT_EMAIL || 'NOT_FOUND',
        length: process.env.FIREBASE_CLIENT_EMAIL?.length || 0
      },
      FIREBASE_PRIVATE_KEY: {
        exists: !!process.env.FIREBASE_PRIVATE_KEY,
        length: process.env.FIREBASE_PRIVATE_KEY?.length || 0,
        hasLiteralNewlines: process.env.FIREBASE_PRIVATE_KEY?.includes('\\n') || false,
        hasRealNewlines: process.env.FIREBASE_PRIVATE_KEY?.includes('\n') || false,
        startsWith: process.env.FIREBASE_PRIVATE_KEY?.substring(0, 35) || 'NOT_FOUND'
      }
    };

    // Test connessione Firebase (solo se le variabili esistono)
    let firebaseTest = null;
    try {
      if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
        firebaseTest = {
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          canConnect: true
        };
      }
    } catch (e) {
      firebaseTest = { error: (e as Error).message };
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'unknown',
      vercel: {
        region: process.env.VERCEL_REGION || 'unknown',
        url: process.env.VERCEL_URL || 'unknown'
      },
      clientVars,
      adminVars,
      firebaseTest,
      issues: {
        clientVarsWithNewlines: Object.entries(clientVars).filter(([_, v]: [string, any]) => v.hasNewlines).map(([k]) => k),
        privateKeyHasLiteralNewlines: adminVars.FIREBASE_PRIVATE_KEY.hasLiteralNewlines
      }
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

