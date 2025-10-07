// app/api/matches/update-details/route.ts
import { NextResponse } from "next/server";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { isEmailAdmin } from "../../../../lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function initAdmin() {
  if (!getApps().length) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    
    if (!projectId || !clientEmail || !privateKey) {
      throw new Error("Mancano FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL o FIREBASE_PRIVATE_KEY in .env.local");
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
    const { matchId, place, date, time, scoreA, scoreB, status, totalGamesA, totalGamesB, set1Games, set2Games, set3Games } = body;
    
    // Validazione input
    if (!matchId) {
      return NextResponse.json({ error: "ID partita mancante" }, { status: 400 });
    }
    
    // Se si sta aggiornando il risultato (recupero partita)
    if (scoreA !== undefined && scoreB !== undefined && status) {
      // Solo l'admin può inserire risultati per partite da recuperare
      if (!isEmailAdmin(userEmail)) {
        return NextResponse.json({ error: "Solo l'admin può inserire i risultati delle partite da recuperare" }, { status: 403 });
      }
      
      // Validazione punteggi padel (0-3, 1-2, 2-1, 3-0)
      const validScores = [
        [0, 3], [1, 2], [2, 1], [3, 0]
      ];
      
      const isValidScore = validScores.some(([a, b]) => 
        (scoreA === a && scoreB === b) || (scoreA === b && scoreB === a)
      );
      
      if (typeof scoreA !== "number" || typeof scoreB !== "number" || !isValidScore) {
        return NextResponse.json({ error: "Punteggi non validi. Usa: 3-0, 2-1, 1-2, 0-3" }, { status: 400 });
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
    
    // Verifica sempre se l'utente è un giocatore della partita
    const isPlayer = await isPlayerInMatch(db, match, userEmail);
    const isAdmin = isEmailAdmin(userEmail);
    
    // Se si sta aggiornando il risultato (recupero partita), l'admin può sempre farlo
    // Altrimenti verifica che l'utente sia uno dei giocatori della partita OPPURE che sia admin
    if (scoreA === undefined && scoreB === undefined) {
      // Aggiornamento dettagli partita - i giocatori possono farlo, l'admin può farlo per partite scheduled
      
      if (!isPlayer && !isAdmin) {
        return NextResponse.json({ error: "Non sei autorizzato a modificare questa partita. Verifica di essere uno dei giocatori della partita e che il tuo account sia collegato al tuo profilo giocatore." }, { status: 403 });
      }
      
      // Se è admin, può aggiornare solo partite in stato "scheduled"
      if (isAdmin && !isPlayer && match.status !== "scheduled") {
        return NextResponse.json({ error: "L'admin può aggiornare i dettagli solo per partite in stato 'scheduled'" }, { status: 403 });
      }
    }
    // Per l'inserimento risultati (recupero), l'admin è già stato verificato sopra
    
    // Verifica che la partita sia in uno stato modificabile
    if (match.status === "completed" && !status) {
      return NextResponse.json({ error: "Non puoi modificare una partita già completata" }, { status: 400 });
    }
    
    // Aggiorna la partita
    if (scoreA !== undefined && scoreB !== undefined && status) {
      // Recupero partita - aggiorna risultato e status
      const updateData: any = {
        scoreA: scoreA,
        scoreB: scoreB,
        status: status,
        completedBy: {
          uid: userId,
          email: decodedToken.email || null
        },
        completedAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };
      
      // Aggiungi i game e i set se forniti
      if (totalGamesA !== undefined) updateData.totalGamesA = totalGamesA;
      if (totalGamesB !== undefined) updateData.totalGamesB = totalGamesB;
      if (set1Games) updateData.set1Games = set1Games;
      if (set2Games) updateData.set2Games = set2Games;
      if (set3Games) updateData.set3Games = set3Games;
      
      // Filtra i valori undefined prima di inviare a Firestore
      const cleanUpdateData: any = {};
      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined) {
          cleanUpdateData[key] = updateData[key];
        }
      });
      
      await db.collection("matches").doc(matchId).update(cleanUpdateData);
      
      // Se la partita era "da recuperare" e ora è "completed", ripristina i dati originali
      if (match.status === 'da recuperare' && status === 'completed' && match.originalData) {
        console.log(`Restoring original data for recovered match ${matchId}`);
        
        const originalData = match.originalData;
        await db.collection("matches").doc(matchId).update({
          // Ripristina i dati originali
          status: originalData.status || 'completed',
          scoreA: originalData.scoreA,
          scoreB: originalData.scoreB,
          totalGamesA: originalData.totalGamesA,
          totalGamesB: originalData.totalGamesB,
          set1Games: originalData.set1Games,
          set2Games: originalData.set2Games,
          set3Games: originalData.set3Games,
          completedBy: originalData.completedBy,
          completedAt: originalData.completedAt,
          confirmedBy: originalData.confirmedBy,
          confirmedAt: originalData.confirmedAt,
          restoredAt: new Date(),
          // Mantieni i campi di congelamento per tracciabilità
          frozenAt: match.frozenAt,
          originalMatchday: match.originalMatchday
        });
        
        console.log(`Successfully restored match ${matchId} with original data`);
      }
    } else {
      // Aggiorna dettagli partita
      const updateData: any = {
        place: place.trim(),
        date: date.trim(),
        time: time.trim(),
        updatedAt: Timestamp.now()
      };
      
      // Aggiungi i game e i set se forniti
      if (totalGamesA !== undefined) updateData.totalGamesA = totalGamesA;
      if (totalGamesB !== undefined) updateData.totalGamesB = totalGamesB;
      if (set1Games) updateData.set1Games = set1Games;
      if (set2Games) updateData.set2Games = set2Games;
      if (set3Games) updateData.set3Games = set3Games;
      
      // Usa lo status inviato dal frontend, altrimenti usa "confirmed" come default
      if (status) {
        updateData.status = status;
        if (status === "completed") {
          updateData.completedBy = {
            uid: userId,
            email: decodedToken.email || null
          };
          updateData.completedAt = Timestamp.now();
        } else if (status === "confirmed") {
          updateData.confirmedBy = {
            uid: userId,
            email: decodedToken.email || null
          };
          updateData.confirmedAt = Timestamp.now();
        }
      } else {
        // Se è un giocatore che conferma, cambia status a "confirmed"
        if (isPlayer) {
          updateData.status = "confirmed";
          updateData.confirmedBy = {
            uid: userId,
            email: decodedToken.email || null
          };
          updateData.confirmedAt = Timestamp.now();
        } else {
          // Se è admin, cambia status da "scheduled" a "confirmed" per permettere inserimento risultati
          updateData.status = "confirmed";
          updateData.confirmedBy = {
            uid: userId,
            email: decodedToken.email || null
          };
          updateData.confirmedAt = Timestamp.now();
          updateData.adminConfirmed = true; // Flag per distinguere conferma admin da giocatore
        }
      }
      
      // Filtra i valori undefined prima di inviare a Firestore
      const cleanUpdateData: any = {};
      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined) {
          cleanUpdateData[key] = updateData[key];
        }
      });
      
      await db.collection("matches").doc(matchId).update(cleanUpdateData);
    }
    
    return NextResponse.json({
      ok: true,
      message: scoreA !== undefined ? "Risultato partita salvato con successo" : 
               (isPlayer ? "Dettagli partita aggiornati con successo" : "Dettagli partita aggiornati e partita confermata. Ora puoi inserire i risultati."),
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
