import { NextResponse } from 'next/server';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Cache per evitare calcoli ripetuti
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minuti

function adminDb() {
  if (!getApps().length) {
    const projectId = process.env.FIREBASE_PROJECT_ID!;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL!;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n');
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  return getFirestore();
}

// Funzione per calcolare la classifica
function calculateStandings(matches: any[]) {
  console.log('=== CALCOLO CLASSIFICA INIZIATO ===');
  console.log('calculateStandings chiamata con', matches.length, 'partite');
  
  const stats = new Map<string, {
    name: string; 
    points: number; 
    setsWon: number; 
    setsLost: number; 
    played: number;
    gamesWon: number;    // Game vinti
    gamesLost: number;   // Game persi
    matchIds: string[]; // DEBUG: traccia le partite per ogni giocatore
  }>();

  const ensure = (id: string, name: string) => {
    if (!stats.has(id)) {
      stats.set(id, { name, points: 0, setsWon: 0, setsLost: 0, played: 0, gamesWon: 0, gamesLost: 0, matchIds: [] });
    }
    return stats.get(id)!;
  };

  // Raggruppa le partite per giornata per verificare se ci sono recuperi
  const matchdaysWithRecoveries = new Set();
  matches.forEach(m => {
    if (m.status === 'da recuperare' && m.originalMatchday) {
      matchdaysWithRecoveries.add(m.originalMatchday);
    }
  });

  matches.forEach((m, index) => {
    // Salta le partite da recuperare
    if (m.status === 'da recuperare') {
      console.log(`⏸️ Partita ${index + 1} (ID: ${m.id}) saltata: da recuperare`);
      return;
    }

    // Salta le partite completate di giornate che hanno recuperi pendenti
    if (m.status === 'completata' && m.matchday && matchdaysWithRecoveries.has(m.matchday)) {
      console.log(`⏸️ Partita ${index + 1} (ID: ${m.id}) saltata: giornata ${m.matchday} ha recuperi pendenti`);
      return;
    }

    const a = Number(m.scoreA || 0);
    const b = Number(m.scoreB || 0);
    const matchId = m.id || `match_${index}`;
    
    // Calcola game totali se disponibili
    const gamesA = Number(m.totalGamesA || 0);
    const gamesB = Number(m.totalGamesB || 0);

    const teamA = (m.teamA || []).map((p: any) => ({ 
      id: p.id || p.playerId, 
      name: p.name || p.Nome || '??' 
    }));
    const teamB = (m.teamB || []).map((p: any) => ({ 
      id: p.id || p.playerId, 
      name: p.name || p.Nome || '??' 
    }));
    
    console.log(`\n--- Processando partita ${index + 1} (ID: ${matchId}) ---`);
    console.log(`Score: ${a}-${b}, Status: ${m.status}`);
    console.log(`Team A:`, teamA.map(p => `${p.name} (${p.id})`));
    console.log(`Team B:`, teamB.map(p => `${p.name} (${p.id})`));
    
    if (!teamA.length || !teamB.length) {
      console.log(`❌ Partita ${index + 1} saltata: team vuoti`);
      return;
    }

    teamA.forEach((p: any) => {
      if (!p.id) {
        console.log('❌ Player A senza ID:', p);
        return;
      }
      const s = ensure(p.id, p.name);
      const oldPoints = s.points;
      const oldPlayed = s.played;
      const oldGamesWon = s.gamesWon;
      const oldGamesLost = s.gamesLost;
      
      s.points += a; 
      s.setsWon += a; 
      s.setsLost += b; 
      s.gamesWon += gamesA;
      s.gamesLost += gamesB;
      s.played += 1;
      s.matchIds.push(matchId);
      
      console.log(`✅ Team A - ${p.name} (${p.id}): punti ${oldPoints}→${s.points}, partite ${oldPlayed}→${s.played}, game ${oldGamesWon}→${s.gamesWon}/${oldGamesLost}→${s.gamesLost}, match: ${matchId}`);
    });
    
    teamB.forEach((p: any) => {
      if (!p.id) {
        console.log('❌ Player B senza ID:', p);
        return;
      }
      const s = ensure(p.id, p.name);
      const oldPoints = s.points;
      const oldPlayed = s.played;
      const oldGamesWon = s.gamesWon;
      const oldGamesLost = s.gamesLost;
      
      s.points += b; 
      s.setsWon += b; 
      s.setsLost += a; 
      s.gamesWon += gamesB;
      s.gamesLost += gamesA;
      s.played += 1;
      s.matchIds.push(matchId);
      
      console.log(`✅ Team B - ${p.name} (${p.id}): punti ${oldPoints}→${s.points}, partite ${oldPlayed}→${s.played}, game ${oldGamesWon}→${s.gamesWon}/${oldGamesLost}→${s.gamesLost}, match: ${matchId}`);
    });
  });

  const result = Array.from(stats.entries())
    .map(([id, s]) => ({
      key: id,
      name: s.name,
      points: s.points,
      setsWon: s.setsWon,
      setsLost: s.setsLost,
      setDiff: s.setsWon - s.setsLost,
      gamesWon: s.gamesWon,
      gamesLost: s.gamesLost,
      gameDiff: s.gamesWon - s.gamesLost,
      played: s.played,
      matchIds: s.matchIds, // DEBUG: includi le partite nel risultato
    }))
    .sort((x, y) => (
      y.points - x.points ||
      (y.setsWon - y.setsLost) - (x.setsWon - x.setsLost) ||
      (y.gamesWon - y.gamesLost) - (x.gamesWon - x.gamesLost) ||
      x.played - y.played ||
      x.name.localeCompare(y.name)
    ));
    
  console.log('\n=== RISULTATO FINALE CLASSIFICA ===');
  console.log('Total players:', result.length);
  
  // Debug dettagliato di ogni giocatore
  result.forEach((player, index) => {
    console.log(`${index + 1}. ${player.name}: ${player.points} punti, ${player.played} partite, game ${player.gamesWon}-${player.gamesLost} (diff: ${player.gameDiff}), matches: [${player.matchIds.join(', ')}]`);
  });
  
  console.log('=== FINE CALCOLO CLASSIFICA ===\n');
  
  return result;
}

export async function GET(req: Request) {
  try {
    // Controlla se richiediamo di invalidare la cache
    const url = new URL(req.url);
    const forceRefresh = url.searchParams.get('refresh') === 'true';
    
    console.log('=== API CLASSIFICA CHIAMATA ===');
    console.log('forceRefresh:', forceRefresh);
    
    // Controlla cache (salta se forceRefresh)
    const cacheKey = 'classifica';
    const cached = cache.get(cacheKey);
    
    if (!forceRefresh && cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log('Usando cache esistente');
      return NextResponse.json({ 
        rows: cached.data,
        cached: true,
        timestamp: cached.timestamp 
      });
    }
    
    if (forceRefresh) {
      console.log('Invalidando cache per forceRefresh');
      cache.delete(cacheKey);
    }

    const db = adminDb();

    // Leggi partite completate con query ottimizzata
    const snap = await db
      .collection('matches')
      .where('status', '==', 'completed')
      .get();
      
    // Se non troviamo partite con status 'completed', proviamo a cercare partite con scoreA e scoreB
    if (snap.empty) {
      console.log('Nessuna partita con status "completed" trovata, cerco partite con score...');
      const allMatches = await db.collection('matches').get();
      const matchesWithScore = allMatches.docs.filter(doc => {
        const data = doc.data();
        return data.scoreA !== undefined && data.scoreB !== undefined && 
               typeof data.scoreA === 'number' && typeof data.scoreB === 'number' &&
               (data.scoreA > 0 || data.scoreB > 0);
      });
      
      if (matchesWithScore.length > 0) {
        console.log(`Trovate ${matchesWithScore.length} partite con score ma senza status 'completed'`);
        const matches = matchesWithScore.map(doc => doc.data());
        const rows = calculateStandings(matches);
        
        return NextResponse.json({ 
          rows,
          cached: false,
          timestamp: Date.now(),
          totalMatches: matches.length,
          warning: "Partite trovate tramite score, non tramite status 'completed'"
        });
      }
    }

    const matches = snap.docs.map(doc => doc.data());
    
    // Debug dettagliato delle partite trovate
    console.log('Partite completate trovate:', matches.length);
    matches.forEach((match, index) => {
      console.log(`Partita ${index + 1}:`, {
        id: match.id,
        phase: match.phase,
        date: match.date,
        teamA: match.teamA?.map(p => ({ id: p.id, name: p.name })),
        teamB: match.teamB?.map(p => ({ id: p.id, name: p.name })),
        scoreA: match.scoreA,
        scoreB: match.scoreB,
        status: match.status
      });
    });
    
    // Ordina le partite per data e poi per ID per consistenza
    let validMatches = matches;
    console.log('Ordinando partite per data...');
    validMatches = matches.sort((a, b) => {
      // Ordina per data e poi per ID per consistenza
      if (a.date && b.date) {
        return a.date.localeCompare(b.date);
      }
      return (a.id || '').localeCompare(b.id || '');
    });
    
    console.log(`Dopo il filtro: ${validMatches.length} partite valide`);
    
    // Calcola classifica
    const rows = calculateStandings(validMatches);
    
    // Debug: log del risultato
    console.log('Classifica calcolata:', {
      forceRefresh,
      matchesCount: validMatches.length,
      rowsCount: rows.length,
      cacheHit: !forceRefresh && cached
    });
    
    // Debug dettagliato di ogni giocatore
    console.log('\n=== DETTAGLIO GIOCATORI ===');
    rows.forEach((player, index) => {
      console.log(`${index + 1}. ${player.name}: ${player.points} punti, ${player.played} partite, game ${player.gamesWon}-${player.gamesLost} (diff: ${player.gameDiff}), matches: [${player.matchIds.join(', ')}]`);
    });
    console.log('=== FINE DETTAGLIO ===\n');

    // Salva in cache
    cache.set(cacheKey, {
      data: rows,
      timestamp: Date.now()
    });

    // Pulisci cache vecchia (mantieni solo ultimi 10 elementi)
    if (cache.size > 10) {
      const entries = Array.from(cache.entries());
      entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
      entries.slice(10).forEach(([key]) => cache.delete(key));
    }

    const response = NextResponse.json({ 
      rows,
      cached: false,
      timestamp: Date.now(),
      totalMatches: validMatches.length
    });
    
    // Disabilita la cache del browser
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    
    return response;
  } catch (e: any) {
    console.error('Errore API classifica:', e);
    return NextResponse.json({ 
      rows: [], 
      error: e?.message || 'Errore interno del server',
      cached: false
    }, { status: 500 });
  }
}