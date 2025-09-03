// app/api/admin/test-classifica/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    console.log('=== TEST CLASSIFICA INIZIATO ===');
    
    // Chiama l'API classifica con refresh forzato
    const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/classifica?refresh=true`);
    const data = await response.json();
    
    console.log('=== TEST CLASSIFICA COMPLETATO ===');
    
    return NextResponse.json({
      ok: true,
      message: 'Test classifica completato. Controlla i log del server.',
      classificaData: data,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error("ERRORE /api/admin/test-classifica:", error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}



