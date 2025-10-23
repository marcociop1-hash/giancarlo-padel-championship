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
  return NextResponse.json({
    ok: true,
    route: "/api/admin/delete-last-matchday",
    usage: "POST -> Cancella l'ultima giornata generata (solo partite scheduled/completed dell'ultima giornata)",
  });
}

export async function POST() {
  try {
    console.log('=== CANCELLAZIONE ULTIMA GIORNATA ===');
    
    const db = adminDb();
    
    // 1. Trova tutte le partite e determina l'ultima giornata
    const allMatchesSnapshot = await db.collection('matches').get();
    const allMatches = allMatchesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    if (allMatches.length === 0) {
      return NextResponse.json({
        ok: false,
        message: "Nessuna partita trovata nel database",
        deleted: 0
      });
    }
    
    // Trova la giornata più alta
    const maxMatchday = Math.max(...allMatches.map(m => m.matchday || 0));
    console.log(`Ultima giornata trovata: ${maxMatchday}`);
    
    // 2. Filtra le partite dell'ultima giornata
    const lastMatchdayMatches = allMatches.filter(m => m.matchday === maxMatchday);
    console.log(`Partite dell'ultima giornata (${maxMatchday}): ${lastMatchdayMatches.length}`);
    
    if (lastMatchdayMatches.length === 0) {
      return NextResponse.json({
        ok: false,
        message: `Nessuna partita trovata per la giornata ${maxMatchday}`,
        deleted: 0
      });
    }
    
    // 3. Mostra dettagli delle partite che verranno cancellate
    console.log('Partite che verranno cancellate:');
    lastMatchdayMatches.forEach(match => {
      const teamA = match.teamA?.map(p => p.name).join('+') || 'N/A';
      const teamB = match.teamB?.map(p => p.name).join('+') || 'N/A';
      console.log(`- ${teamA} vs ${teamB} (${match.status})`);
    });
    
    // 4. Cancella le partite dell'ultima giornata
    const batch = db.batch();
    lastMatchdayMatches.forEach(match => {
      const matchRef = db.collection('matches').doc(match.id);
      batch.delete(matchRef);
    });
    
    await batch.commit();
    
    console.log(`✅ Cancellate ${lastMatchdayMatches.length} partite della giornata ${maxMatchday}`);
    
    // 5. Invalida la cache della classifica
    try {
      const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/classifica?refresh=true`);
      if (!response.ok) {
        console.log('Errore invalidation cache classifica:', response.status);
      }
    } catch (e) {
      console.log('Errore invalidation cache classifica:', e);
    }
    
    return NextResponse.json({
      ok: true,
      message: `Giornata ${maxMatchday} cancellata. ${lastMatchdayMatches.length} partite eliminate.`,
      deleted: lastMatchdayMatches.length,
      matchday: maxMatchday
    });
    
  } catch (error: any) {
    console.error("ERRORE /api/admin/delete-last-matchday:", error);
    return NextResponse.json({ 
      error: error.message 
    }, { status: 500 });
  }
}
