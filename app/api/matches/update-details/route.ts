// app/api/matches/update-details/route.ts
import { NextResponse } from "next/server";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

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
  return { db: getFirestore(), auth: getAuth() };
}

// Helper per verificare se un utente è uno dei giocatori della partita
async function isPlayerInMatch(db: FirebaseFirestore.Firestore, match: any, userEmail: string): Promise<boolean> {
  if (!match || !userEmail) return false;
  
  // Estrai tutti gli ID dei giocatori dalla partita
  const playerIds = new Set<string>();
  
  // Team A
  if (match.teamA && Array.isArray(match.teamA)) {
    match.teamA.forEach((player: any) => {
      if (player && player.id) playerIds.add(player.id);
    });
  }
  
  // Team B
  if (match.teamB && Array.isArray(match.teamB)) {
    match.teamB.forEach((player: any) => {
      if (player && player.id) playerIds.add(player.id);
    });
  }
  
  // Se non ci sono ID di giocatori, non può essere nella partita
  if (playerIds.size === 0) return false;
  
  // Cerca il giocatore con l'email dell'utente autenticato
  try {
    const playersQuery = await db.collection("players")
      .where("email", "==", userEmail)
      .limit(1)
      .get();
    
    if (playersQuery.empty) return false;
    
    const playerDoc = playersQuery.docs[0];
    const playerId = playerDoc.id;
    
    return playerIds.has(playerId);
  } catch (error) {
    console.error("Errore nella ricerca del giocatore:", error);
    return false;
  }
}

export async function POST(req: Request) {
  try {
    const { db, auth } = initAdmin();
    
    // Verifica autenticazione
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Token di autenticazione mancante" }, { status: 401 });
    }
    
    const token = authHeader.substring(7);
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch (error) {
      return NextResponse.json({ error: "Token non valido" }, { status: 401 });
    }
    
    const userId = decodedToken.uid;
    const userEmail = decodedToken.email;
    
    if (!userEmail) {
      return NextResponse.json({ error: "Email utente non disponibile" }, { status: 400 });
    }
    
    // Parsing del body
    const body = await req.json();
    const { matchId, place, date, time, scoreA, scoreB, status } = body;
    
    // Validazione input
    if (!matchId) {
      return NextResponse.json({ error: "ID partita mancante" }, { status: 400 });
    }
    
    // Se si sta aggiornando il risultato (recupero partita)
    if (scoreA !== undefined && scoreB !== undefined && status) {
      // Solo l'admin può inserire risultati per partite da recuperare
      if (userEmail !== "admin@giancarlo-padel.com") {
        return NextResponse.json({ error: "Solo l'admin può inserire i risultati delle partite da recuperare" }, { status: 403 });
      }
      
      if (typeof scoreA !== "number" || typeof scoreB !== "number" || scoreA < 0 || scoreB < 0) {
        return NextResponse.json({ error: "Punteggi non validi" }, { status: 400 });
      }
      if (status !== "completed") {
        return NextResponse.json({ error: "Status non valido per il recupero" }, { status: 400 });
      }
    } else {
      // Se si stanno aggiornando i dettagli (conferma partita)
      if (!place || !date || !time) {
        return NextResponse.json({ error: "Campo, data e ora sono obbligatori" }, { status: 400 });
      }
    }
    
    // Recupera la partita
    const matchDoc = await db.collection("matches").doc(matchId).get();
    if (!matchDoc.exists) {
      return NextResponse.json({ error: "Partita non trovata" }, { status: 404 });
    }
    
    const match = matchDoc.data();
    
    if (!match) {
      return NextResponse.json({ error: "Dati partita non disponibili" }, { status: 500 });
    }
    
    // Verifica che l'utente sia uno dei giocatori della partita
    const isPlayer = await isPlayerInMatch(db, match, userEmail);
    if (!isPlayer) {
      return NextResponse.json({ error: "Non sei autorizzato a modificare questa partita. Verifica di essere uno dei giocatori della partita e che il tuo account sia collegato al tuo profilo giocatore." }, { status: 403 });
    }
    
    // Verifica che la partita sia in uno stato modificabile
    if (match.status === "completed" && !status) {
      return NextResponse.json({ error: "Non puoi modificare una partita già completata" }, { status: 400 });
    }
    
    // Aggiorna la partita
    if (scoreA !== undefined && scoreB !== undefined && status) {
      // Recupero partita - aggiorna risultato e status
      await db.collection("matches").doc(matchId).update({
        scoreA: scoreA,
        scoreB: scoreB,
        status: status,
        completedBy: {
          uid: userId,
          email: decodedToken.email || null
        },
        completedAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });
    } else {
      // Conferma partita - aggiorna dettagli
      await db.collection("matches").doc(matchId).update({
        place: place.trim(),
        date: date.trim(),
        time: time.trim(),
        status: "confirmed",
        confirmedBy: {
          uid: userId,
          email: decodedToken.email || null
        },
        confirmedAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });
    }
    
    return NextResponse.json({
      ok: true,
      message: scoreA !== undefined ? "Risultato partita salvato con successo" : "Dettagli partita aggiornati con successo",
      matchId
    });
    
  } catch (error: any) {
    console.error("ERRORE /api/matches/update-details:", error);
    return NextResponse.json({ 
      error: error.message || "Errore interno del server" 
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/matches/update-details",
    usage: "POST -> Aggiorna dettagli partita (campo, data, ora). Richiede autenticazione e che l'utente sia uno dei giocatori della partita.",
  });
}
