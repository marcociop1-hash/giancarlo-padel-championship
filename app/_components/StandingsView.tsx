'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { computeStandings, PlayerDoc, MatchDoc, StandingsResult } from '../lib/standings';

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'done'; data: StandingsResult; meta: { matchesTotal: number; matchesWithSets: number } };

type NormSet = [number, number] | { winner: 'A' | 'B' };

export default function StandingsView() {
  const [state, setState] = useState<LoadState>({ status: 'idle' });

  const load = useMemo(() => async () => {
    setState({ status: 'loading' });
    try {
      // Players
      const playersSnap = await getDocs(collection(db, 'players'));
      const players: PlayerDoc[] = playersSnap.docs.map(d => ({
        id: d.id,
        name: (d.data() as any).name ?? 'Senza nome',
      }));
      const validIds = new Set(players.map(p => p.id));

      // Matches
      const matchesSnap = await getDocs(collection(db, 'matches'));
      const raw: any[] = matchesSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

      const matches: MatchDoc[] = raw.map((m: any) => {
        const teamAIds = (Array.isArray(m.teamA) ? m.teamA : [])
          .map((x: any) => x?.id)
          .filter((id: any) => typeof id === 'string' && validIds.has(id));
        const teamBIds = (Array.isArray(m.teamB) ? m.teamB : [])
          .map((x: any) => x?.id)
          .filter((id: any) => typeof id === 'string' && validIds.has(id));

        // SETS: usa array se presente, altrimenti ricostruisci da scoreA/scoreB, poi fallback su winnerTeam
        let sets: NormSet[] = [];
        if (Array.isArray(m.sets) && m.sets.length) {
          sets = normalizeSetsArray(m.sets);
        }
        if (!sets.length) {
          const a = toNum(m?.scoreA);
          const b = toNum(m?.scoreB);
          if (a !== null && b !== null && (a > 0 || b > 0)) {
            const out: NormSet[] = [];
            for (let i = 0; i < a; i++) out.push({ winner: 'A' });
            for (let i = 0; i < b; i++) out.push({ winner: 'B' });
            sets = out;
          }
        }
        if (!sets.length && (m?.winnerTeam === 'A' || m?.winnerTeam === 'B')) {
          const w = m.winnerTeam === 'A' ? 'A' : 'B';
          sets = [{ winner: w }, { winner: w }];
        }

        return {
          id: m.id ?? String(m.docId ?? ''),
          teamA: [teamAIds[0] ?? null, teamAIds[1] ?? null] as any,
          teamB: [teamBIds[0] ?? null, teamBIds[1] ?? null] as any,
          sets,
          status: m.status === 'completed' || m.status === 'scheduled' ? m.status : undefined,
          scheduledAt: m.scheduledAt ?? m.date ?? m.datetime ?? undefined,
          court: m.court ?? m.field ?? m.place ?? m.campo ?? undefined,
        };
      });

      const meta = {
        matchesTotal: matches.length,
        matchesWithSets: matches.filter(m => (m.sets?.length ?? 0) > 0).length,
      };

      const result = computeStandings(players, matches); // ⬅️ restituisce matchesPlayed, setDiff, points, ecc.
      setState({ status: 'done', data: result, meta });
    } catch (e: any) {
      setState({ status: 'error', message: e?.message ?? 'Errore' });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div
      style={{
        borderRadius: 12,
        padding: 16,
        // sfondo verde chiaro come richiesto
        background: 'linear-gradient(180deg, #f1fff4 0%, #ebfff0 60%, #e6ffed 100%)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}
    >
      <h1 style={{ margin: '8px 0 16px 0' }}>Classifica</h1>

      {state.status === 'loading' && <div>Caricamento…</div>}
      {state.status === 'error' && <div style={{ color: 'red' }}>Errore: {state.message}</div>}

      {state.status === 'done' && (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
              <thead>
                <tr>
                  <th style={th}>#</th>
                  <th style={thLeft}>Giocatore</th>
                  {/* 🔽 SOLO le 3 colonne richieste */}
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

          {/* Legenda richiesta */}
          <div style={{ marginTop: 16, fontSize: 14, lineHeight: 1.5 }}>
            <strong>Legenda:</strong>
            <div>P: partite giocate</div>
            <div>DG: differenza "set vinti" - "set persi"</div>
            <div>P: Punti (ogni set vinto è 1 punto)</div>
          </div>
        </>
      )}
    </div>
  );
}

/* ===== helpers ===== */
function normalizeSetsArray(input: any): NormSet[] {
  if (!Array.isArray(input)) return [];
  const out: NormSet[] = [];
  for (const s of input) {
    if (typeof s === 'string') {
      const m = s.replace(/[–—]/g, '-').trim().match(/^(\d+)\s*[-:/]\s*(\d+)$/);
      if (m) { out.push([+m[1], +m[2]]); continue; }
      const win = s.toUpperCase();
      if (win === 'A' || win === 'B') { out.push({ winner: win as 'A'|'B' }); continue; }
    }
    if (Array.isArray(s) && s.length >= 2 && isNum(s[0]) && isNum(s[1])) {
      out.push([+s[0], +s[1]]); continue;
    }
    if (s && typeof s === 'object') {
      if ((s as any).winner === 'A' || (s as any).winner === 'B') { out.push({ winner: (s as any).winner }); continue; }
      const pairs: Array<[any, any]> = [
        [(s as any).a, (s as any).b], [(s as any).A, (s as any).B],
        [(s as any).teamA, (s as any).teamB], [(s as any).gamesA, (s as any).gamesB],
      ];
      for (const [ga, gb] of pairs) if (isNum(ga) && isNum(gb)) { out.push([+ga, +gb]); break; }
    }
  }
  return out;
}
function toNum(v: any): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}
function isNum(n: any): boolean {
  return (typeof n === 'number' && Number.isFinite(n)) ||
         (typeof n === 'string' && n.trim() !== '' && Number.isFinite(Number(n)));
}

/* ============ STILI ============ */
const thBase: React.CSSProperties = {
  textAlign: 'center',
  padding: '10px 8px',
  borderBottom: '2px solid #dfe9e3',
  fontWeight: 600,
  whiteSpace: 'nowrap',
};
const th = thBase;
const thLeft = { ...thBase, textAlign: 'left' as const };
const tdBase: React.CSSProperties = { padding: '10px 8px', borderBottom: '1px solid #eef2ee', whiteSpace: 'nowrap' };
const tdCenter = { ...tdBase, textAlign: 'center' as const };
const tdLeft = { ...tdBase, textAlign: 'left' as const };
const tr: React.CSSProperties = {};
const trAlt: React.CSSProperties = { background: '#f8fff9' };
