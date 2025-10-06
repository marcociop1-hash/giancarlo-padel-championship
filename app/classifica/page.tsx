'use client';

import { useEffect, useState } from 'react';

type Row = {
  playerId: string;      // Cambio da 'key' a 'playerId' per compatibilità
  rank: number;
  name: string;
  points: number;        // Punti (1 per ogni set vinto)
  setsWon: number;       // Set vinti
  setsLost: number;      // Set persi
  setDiff: number;       // Differenza set (set vinti - set persi)
  played: number;        // Partite giocate
  gamesWon: number;      // Game vinti
  gamesLost: number;     // Game persi
  gameDiff: number;      // Differenza game (game vinti - game persi)
};

export default function Page() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string>('');

  async function load(forceRefresh = false) {
    setLoading(true);
    setErr('');
    try {
      const url = forceRefresh ? '/api/classifica?refresh=true' : '/api/classifica';
      console.log('🔍 Caricando classifica da:', url);
      
      const response = await fetch(url);
      console.log('📡 Response status:', response.status, response.statusText);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('📊 Dati ricevuti:', data);
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      console.log('✅ Impostando rows:', data.rows?.length || 0, 'elementi');
      setRows(data.rows || []);
    } catch (e: any) {
      console.error('❌ Errore nel caricamento:', e);
      setErr(e?.message || 'Errore nel caricamento della classifica');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { 
    load(); 
  }, []);

  const hasData = rows.length > 0;
  
  // Debug: log dello stato
  console.log('🎯 Stato componente:', { loading, err, hasData, rowsCount: rows.length });

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Classifica Padel</h1>
                  <button
            onClick={() => load(true)}
            className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
          Aggiorna
        </button>
      </div>

      {/* LEGENDA */}
      <div className="mt-4 rounded-lg border bg-blue-50 p-4">
        <h3 className="mb-2 font-semibold text-blue-900">�� Legenda Classifica</h3>
        <div className="grid grid-cols-1 gap-2 text-sm text-blue-800 sm:grid-cols-2 lg:grid-cols-4">
          <div><strong>PG:</strong> Partite Giocate</div>
          <div><strong>SV:</strong> Set Vinti</div>
          <div><strong>SP:</strong> Set Persi</div>
          <div><strong>DS:</strong> Differenza Set (set vinti - set persi)</div>
          <div><strong>GV:</strong> Game Vinti</div>
          <div><strong>GP:</strong> Game Persi</div>
          <div><strong>DG:</strong> Differenza Game (game vinti - game persi)</div>
          <div><strong>P:</strong> Punti (1 per ogni set vinto)</div>
        </div>
        <div className="mt-2 text-xs text-blue-700">
          <strong>Ordinamento:</strong> Punti → Differenza Set → Differenza Game → Partite Giocate → Nome
        </div>
      </div>

      {loading && (
        <div className="mt-6 rounded-md border p-4 text-sm text-gray-700">
          Caricamento classifica...
        </div>
      )}

      {!loading && err && (
        <div className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-red-700">
          ❌ {err}
        </div>
      )}

      {!loading && !err && !hasData && (
        <div className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-800">
          📭 Nessun dato classifica disponibile.
        </div>
      )}

      {!loading && !err && hasData && (
        <section className="mt-6">
          <div className="overflow-x-auto rounded-lg border shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-emerald-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-emerald-900">#</th>
                  <th className="px-4 py-3 text-left font-semibold text-emerald-900">Giocatore</th>
                  <th className="px-4 py-3 text-center font-semibold text-emerald-900" title="Partite Giocate">PG</th>
                  <th className="px-4 py-3 text-center font-semibold text-emerald-900" title="Set Vinti">SV</th>
                  <th className="px-4 py-3 text-center font-semibold text-emerald-900" title="Set Persi">SP</th>
                  <th className="px-4 py-3 text-center font-semibold text-emerald-900" title="Differenza Set (set vinti - set persi)">DS</th>
                  <th className="px-4 py-3 text-center font-semibold text-emerald-900" title="Game Vinti">GV</th>
                  <th className="px-4 py-3 text-center font-semibold text-emerald-900" title="Game Persi">GP</th>
                  <th className="px-4 py-3 text-center font-semibold text-emerald-900" title="Differenza Game (game vinti - game persi)">DG</th>
                  <th className="px-4 py-3 text-center font-semibold text-emerald-900" title="Punti (1 per ogni set vinto)">P</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr 
                    key={r.playerId} 
                    className={`${
                      idx === 0 ? 'bg-yellow-50 border-l-4 border-yellow-400' : 
                      idx === 1 ? 'bg-gray-100 border-l-4 border-gray-400' : 
                      idx === 2 ? 'bg-amber-100 border-l-4 border-amber-400' : 
                      idx % 2 ? 'bg-white' : 'bg-gray-50'
                    } hover:bg-emerald-50 transition-colors`}
                  >
                    <td className="px-4 py-3 font-medium">
                      {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : r.rank}
                    </td>
                    <td className="px-4 py-3 font-medium">{r.name}</td>
                    <td className="px-4 py-3 text-center text-gray-600">{r.played}</td>
                    <td className="px-4 py-3 text-center text-green-600">{r.setsWon}</td>
                    <td className="px-4 py-3 text-center text-red-600">{r.setsLost}</td>
                    <td className={`px-4 py-3 text-center font-medium ${
                      r.setDiff > 0 ? 'text-green-600' : r.setDiff < 0 ? 'text-red-600' : 'text-gray-600'
                    }`}>
                      {r.setDiff > 0 ? `+${r.setDiff}` : r.setDiff}
                    </td>
                    <td className="px-4 py-3 text-center text-blue-600">{r.gamesWon || 0}</td>
                    <td className="px-4 py-3 text-center text-orange-600">{r.gamesLost || 0}</td>
                    <td className={`px-4 py-3 text-center font-medium ${
                      (r.gameDiff || 0) > 0 ? 'text-green-600' : (r.gameDiff || 0) < 0 ? 'text-red-600' : 'text-gray-600'
                    }`}>
                      {(r.gameDiff || 0) > 0 ? `+${r.gameDiff}` : (r.gameDiff || 0)}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-emerald-700">{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 text-center text-xs text-gray-500">
            <p>🎾 Classifica aggiornata automaticamente dai risultati delle partite</p>
            <p>Ultimo aggiornamento: {new Date().toLocaleString('it-IT')}</p>
          </div>
        </section>
      )}
    </main>
  );
}