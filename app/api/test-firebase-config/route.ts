// app/api/test-firebase-config/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const results = {
      serviceAccountKey: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
      projectId: !!process.env.FIREBASE_PROJECT_ID,
      clientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: !!process.env.FIREBASE_PRIVATE_KEY,
      serviceAccountKeyLength: process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.length || 0,
      privateKeyLength: process.env.FIREBASE_PRIVATE_KEY?.length || 0,
    };

    // Test parsing della service account key
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      try {
        const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
        results.serviceAccountParsed = true;
        results.serviceAccountProjectId = parsed.project_id;
        results.serviceAccountClientEmail = parsed.client_email;
      } catch (error) {
        results.serviceAccountParsed = false;
        results.serviceAccountError = error.message;
      }
    }

    return NextResponse.json({
      success: true,
      environment: process.env.NODE_ENV,
      results
    });

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
