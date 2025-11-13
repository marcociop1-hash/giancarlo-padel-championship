// Script per cancellare tutte le partite di una giornata specifica
const matchday = 4; // Quarta giornata
const apiUrl = 'https://giancarlo-padel-championship.vercel.app/api/matches';

async function deleteMatchday() {
  try {
    console.log(`🔄 Caricando tutte le partite per trovare la giornata ${matchday}...`);
    
    // Carica tutte le partite
    const response = await fetch(apiUrl);
    const data = await response.json();
    
    if (!data.success) {
      console.error('❌ Errore nel caricamento partite:', data.error);
      return;
    }
    
    const allMatches = data.matches || [];
    console.log(`✅ Trovate ${allMatches.length} partite totali`);
    
    // Filtra le partite della quarta giornata
    const matchdayMatches = allMatches.filter(m => m.matchday === matchday);
    
    console.log(`📊 Partite della giornata ${matchday}: ${matchdayMatches.length}`);
    
    if (matchdayMatches.length === 0) {
      console.log(`⚠️  Nessuna partita trovata per la giornata ${matchday}`);
      return;
    }
    
    // Mostra le partite che verranno cancellate
    console.log('\n📋 Partite da cancellare:');
    matchdayMatches.forEach((match, index) => {
      const teamA = Array.isArray(match.teamA) 
        ? match.teamA.map(p => p.name || p.Nome || p.id).join(' + ')
        : match.teamA || '??';
      const teamB = Array.isArray(match.teamB)
        ? match.teamB.map(p => p.name || p.Nome || p.id).join(' + ')
        : match.teamB || '??';
      console.log(`   ${index + 1}. ${teamA} vs ${teamB} (ID: ${match.id}, Status: ${match.status})`);
    });
    
    console.log(`\n⚠️  ATTENZIONE: Stai per cancellare ${matchdayMatches.length} partite della giornata ${matchday}`);
    console.log('🔄 Cancellazione in corso...\n');
    
    // Cancella le partite via API
    const deleteResponse = await fetch('https://giancarlo-padel-championship.vercel.app/api/admin/delete-matchday', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        matchday: matchday
      })
    });
    
    const deleteData = await deleteResponse.json();
    
    if (!deleteData.success) {
      console.error('❌ Errore nella cancellazione:', deleteData.error);
      return;
    }
    
    console.log('✅ Cancellazione completata!');
    console.log(`   Partite cancellate: ${deleteData.deletedCount}`);
    console.log('\n📋 Partite cancellate:');
    deleteData.deletedMatches.forEach((match, index) => {
      console.log(`   ${index + 1}. ID: ${match.id} (Status: ${match.status})`);
    });
    
  } catch (error) {
    console.error('❌ Errore:', error.message);
  }
}

deleteMatchday();

