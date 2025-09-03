// src/pages/StandingsPage.tsx
// Legge players e matches da Firestore (client) e mostra la classifica
// con le colonne richieste: P, DG, P. Include la legenda esatta.

import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../../lib/firebase'; // <-- se il tuo file è altrove, cambia SOLO questo import
import { collection, getDocs } from 'firebase/firestore';
import { computeStandings, PlayerDoc, MatchDoc, StandingsResult } from '../lib/standings';

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'done'; data: StandingsResult };

const Legend: React.FC = () => (
  <div style={{ marginTop: 16, fontSize: 14, lineHeight: 1.5 }}>
    <strong>Legenda:</strong>
    <div>P: partite giocate</div>
    <div>DG: differenza "set vinti" - "set persi"</div>
    <div>P: Punti (ogni set vinto è 1 punto)</div>
  </div>
);

const StandingsPage: React.FC = () => {
  const [state, setState] = useState<LoadState>({ status: 'idle' });

  const load = useMemo(() => async () => {
    setState({ status: 'loading' });
    try {
      // Carica players
      const playersSnap = await getDocs(collection(db, 'players'));
      const players: PlayerDoc[] = playersSnap.docs.map(d => ({
        id: d.id,
        name: (d.data() as any).name ?? 'Senza nome',
      }));

      // Carica matches
      const matchesSnap = await getDocs(collection(db, 'matches'));
      const matches: MatchDoc[] = matchesSnap.docs.map(d => {
        const data = d.data() as any;
        return {
          id: d.id,
          teamA: (data.teamA ?? [null, null]) as [string, string],
          teamB: (data.teamB ?? [null, null]) as [string, string],
          sets: Array.isArray(data.sets) ? data.sets : [],
          status: data.status,
          scheduledAt: data.scheduledAt,
          court: data.court,
        };
      });

      const result = computeStandings(players, matches);
      setState({ status: 'done', data: result });
    } catch (e: any) {
      setState({ status: 'error', message: e?.message ?? 'Errore' });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div style={{ maxWidth: 960, margin: '24px auto', padding: '0 16px' }}>
      <h1 style={{ marginBottom: 12 }}>Classifica</h1>

      {state.status === 'loading' && <div>Caricamento…</div>}
      {state.status === 'error' && <div style={{ color: 'red' }}>Errore: {state.message}</div>}

      {state.status === 'done' && (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                minWidth: 520,
              }}
            >
              <thead>
                <tr>
                  <th style={th}>#</th>
                  <th style={thLeft}>Giocatore</th>
                  <th style={th} title="Partite giocate">P</th>
                  <th style={th} title="Set vinti - set persi">DG</th>
                  <th style={th} title="Punti: 1 per ogni set vinto">P</th>
                </tr>
              </thead>
              <tbody>
                {state.data.rows.map((row, idx) => (
                  <tr key={row.playerId} style={idx % 2 ? trAlt : tr}>
                    <td style={tdCenter}>{idx + 1}</td>
                    <td style={tdLeft}>{row.name}</td>
                    <td style={tdCenter}>{row.matchesPlayed}</td>
                    <td style={tdCenter}>{row.setDiff}</td>
                    <td style={tdCenter}>{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Legend />

          <details style={{ marginTop: 16 }}>
            <summary>Vedi dettaglio set</summary>
            <div style={{ overflowX: 'auto', marginTop: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                <thead>
                  <tr>
                    <th style={thLeft}>Giocatore</th>
                    <th style={th}>Set Vinti</th>
                    <th style={th}>Set Persi</th>
                  </tr>
                </thead>
                <tbody>
                  {state.data.rows.map(r => (
                    <tr key={r.playerId}>
                      <td style={tdLeft}>{r.name}</td>
                      <td style={tdCenter}>{r.setsWon}</td>
                      <td style={tdCenter}>{r.setsLost}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  );
};

// Stili base (semplici e responsive)
const thBase: React.CSSProperties = {
  textAlign: 'center',
  padding: '10px 8px',
  borderBottom: '2px solid #ddd',
  fontWeight: 600,
  whiteSpace: 'nowrap',
};
const th = thBase;
const thLeft = { ...thBase, textAlign: 'left' as const };

const tdBase: React.CSSProperties = {
  padding: '10px 8px',
  borderBottom: '1px solid #eee',
  whiteSpace: 'nowrap',
};
const tdCenter = { ...tdBase, textAlign: 'center' as const };
const tdLeft = { ...tdBase, textAlign: 'left' as const };

const tr: React.CSSProperties = {};
const trAlt: React.CSSProperties = { background: '#fafafa' };

export default StandingsPage;
