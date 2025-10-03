// app/api/admin/reset-campionato/route.ts
import { NextResponse } from "next/server";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function initAdmin() {
  if (!getApps().length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    if (!projectId || !clientEmail || !privateKey) {
      throw new Error("Mancano FIREBASE_* in .env.local");
    }
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  return getFirestore();
}

// util: cancellazione batch di una collezione
async function deleteAllFromCollection(db: FirebaseFirestore.Firestore, colName: string) {
  const BATCH = 400;
  while (true) {
    const snap = await db.collection(colName).limit(BATCH).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    if (snap.size < BATCH) break;
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/admin/reset-campionato",
    usage: "POST -> Reset del torneo: scongela campionato. Parametri opzionali: ?wipeMatches=true per cancellare tutte le partite.",
  });
}

export async function POST(req: Request) {
  try {
    const db = initAdmin();
    const url = new URL(req.url);
    const wipeMatches = url.searchParams.get("wipeMatches") === "true";

    // 1) cancella classifica congelata del campionato
    await deleteAllFromCollection(db, "standings_campionato");

    // 2) (opzionale) cancella tutte le partite (campionato + supercoppa)
    if (wipeMatches) {
      await deleteAllFromCollection(db, "matches");
    } else {
      // Se non cancelli tutte le partite, cancella solo quelle della supercoppa
      const supercoppaMatches = await db.collection("matches").where("phase", "==", "supercoppa").get();
      const batch = db.batch();
      supercoppaMatches.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }

    // 3) resetta stato torneo -> si torna a "campionato" (non completato)
    await db.collection("config").doc("tournament").set(
      {
        phase: "campionato",
        completedAt: null,
      },
      { merge: true }
    );

    // 4) resetta stato supercoppa (se presente)
    await db.collection("config").doc("tournament").set(
      {
        phase: "campionato",
        completedAt: null,
        supercoppaStartedAt: null,
        totalMatches: null,
      },
      { merge: true }
    );

    // 5) Invalida completamente la cache della classifica
    try {
      // Cancella la cache locale se esiste
      if (typeof global !== 'undefined' && global.classificaCache) {
        global.classificaCache.clear();
      }
      
      // Chiama l'API classifica con refresh per invalidare la cache
      const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/classifica?refresh=true`);
      if (!response.ok) {
        console.log('Errore invalidation cache classifica:', response.status);
      }
      
      console.log('✅ Cache classifica invalidata completamente');
    } catch (e) {
      console.log('Errore invalidation cache classifica:', e);
    }

    return NextResponse.json({
      ok: true,
      message: `Reset completato. ${wipeMatches ? "Partite eliminate. " : ""}Campionato sbloccato. Classifica resettata.`,
    });
  } catch (err: any) {
    console.error("ERRORE /api/admin/reset-campionato:", err);
    return new NextResponse(err?.message || "Errore interno nel reset", { status: 500 });
  }
}
