'use client';

import { useEffect, useState } from 'react';
import { db } from '../../../lib/firebase'; // ⚠️ lasciato come nel tuo file
import { collection, getDocs } from 'firebase/firestore';

// Un set può essere [gamesA, gamesB] oppure {winner:'A'|'B'}
// Per i tuoi dati basta {winner:...} ricostruito da scoreA/scoreB
type NormSet = [number, number] | { winner: 'A' | 'B' };

export default function Page() {
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'matches'));
        const docs: any[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

        const mapped = docs.map((raw: any) => {
          const aRaw = raw?.scoreA;
          const bRaw = raw?.scoreB;

          // Converto in numero in modo aggressivo (accetta number o stringa numerica)
          const a = toNum(aRaw);
          const b = toNum(bRaw);

          let sets: NormSet[] = [];
          let reason = 'not found';

          // 1) se hai un array dettagliato di set (future proof)
          if (Array.isArray(raw?.sets)) {
            sets = normalizeSetsArray(raw.sets);
            if (sets.length) reason = 'sets[]';
          }

          // 2) altrimenti usa scoreA/scoreB (il TUO caso attuale)
          if (!sets.length && a !== null && b !== null) {
            if (a > 0 || b > 0) {
              const out: NormSet[] = [];
              for (let i = 0; i < a; i++) out.push({ winner: 'A' });
              for (let i = 0; i < b; i++) out.push({ winner: 'B' });
              sets = out;
              reason = 'scoreA/scoreB';
            }
          }

          // 3) fallback su winnerTeam se manca tutto il resto
          if (!sets.length && (raw?.winnerTeam === 'A' || raw?.winnerTeam === 'B')) {
            const w = raw.winnerTeam === 'A' ? 'A' : 'B';
            sets = [{ winner: w }, { winner: w }];
            reason = 'winnerTeam (fallback 2-0)';
          }

          return {
            id: raw.id || `(docId=${String(raw?.docId ?? '')})`,
            status: raw.status,
            scoreA: raw.scoreA,
            typeOfA: typeof aRaw,
            parsedA: a,
            scoreB: raw.scoreB,
            typeOfB: typeof bRaw,
            parsedB: b,
            winnerTeam: raw.winnerTeam,
            teamA: raw.teamA,
            teamB: raw.teamB,
            setsFound: sets,
            reason,
            keys: Object.keys(raw).join(', '),
          };
        });

        setRows(mapped);
        console.log('[DEBUG] matches normalized:', mapped);
      } catch (e: any) {
        setErr(e?.message || 'Errore');
      }
    })();
  }, []);

  return (
    <div style={{ maxWidth: 1300, margin: '24px auto', padding: '0 16px' }}>
      <h1>Debug Classifica</h1>
      {err && <div style={{ color: 'red' }}>{err}</div>}

      <p style={{ marginTop: 8 }}>
        Per i tuoi dati uso <code>scoreA/scoreB</code> per ricostruire i set. Controlla le colonne
        <b> typeOfA/B</b> e <b>parsedA/B</b> per capire se i valori arrivano correttamente.
      </p>

      <div style={{ overflowX: 'auto', marginTop: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1200 }}>
          <thead>
            <tr>
              <th style={th}>id</th>
              <th style={th}>status</th>
              <th style={th}>scoreA</th>
              <th style={th}>typeOfA</th>
              <th style={th}>parsedA</th>
              <th style={th}>scoreB</th>
              <th style={th}>typeOfB</th>
              <th style={th}>parsedB</th>
              <th style={th}>winnerTeam</th>
              <th style={thLeft}>setsFound</th>
              <th style={thLeft}>reason</th>
              <th style={thLeft}>raw keys</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={i % 2 ? trAlt : tr}>
                <td style={td}>{r.id}</td>
                <td style={td}>{r.status ?? '-'}</td>
                <td style={td}>{String(r.scoreA ?? '-')}</td>
                <td style={td}>{String(r.typeOfA)}</td>
                <td style={td}>{String(r.parsedA)}</td>
                <td style={td}>{String(r.scoreB ?? '-')}</td>
                <td style={td}>{String(r.typeOfB)}</td>
                <td style={td}>{String(r.parsedB)}</td>
                <td style={td}>{String(r.winnerTeam ?? '-')}</td>
                <td style={tdLeft}>{JSON.stringify(r.setsFound ?? [])}</td>
                <td style={tdLeft}>{r.reason}</td>
                <td style={tdLeft}>{r.keys}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ===== helpers ===== */

function toNum(v: any): number | null {
  // accetta number o stringa numerica (es. "3")
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function normalizeSetsArray(input: any): NormSet[] {
  if (!Array.isArray(input)) return [];
  const out: NormSet[] = [];
  for (const s of input) {
    if (typeof s === 'string') {
      const clean = s.replace(/[–—]/g, '-').trim();
      const m = clean.match(/^(\d+)\s*[-:/]\s*(\d+)$/);
      if (m) { out.push([+m[1], +m[2]]); continue; }
      const win = clean.toUpperCase();
      if (win === 'A' || win === 'B') { out.push({ winner: win as 'A'|'B' }); continue; }
    }
    if (Array.isArray(s) && s.length >= 2 && isFiniteNum(s[0]) && isFiniteNum(s[1])) {
      out.push([+s[0], +s[1]]); continue;
    }
    if (s && typeof s === 'object') {
      if ((s as any).winner === 'A' || (s as any).winner === 'B') { out.push({ winner: (s as any).winner }); continue; }
      const pairs: Array<[any, any]> = [
        [(s as any).a, (s as any).b], [(s as any).A, (s as any).B],
        [(s as any).teamA, (s as any).teamB], [(s as any).gamesA, (s as any).gamesB],
      ];
      for (const [ga, gb] of pairs) {
        if (isFiniteNum(ga) && isFiniteNum(gb)) { out.push([+ga, +gb]); break; }
      }
    }
  }
  return out;
}

function isFiniteNum(n: any): boolean {
  return (typeof n === 'number' && Number.isFinite(n)) ||
         (typeof n === 'string' && n.trim() !== '' && Number.isFinite(Number(n)));
}

/* --- stile tabella --- */
const th: React.CSSProperties = { padding: '8px', borderBottom: '2px solid #ddd', whiteSpace: 'nowrap' };
const thLeft: React.CSSProperties = { ...th, textAlign: 'left' };
const td: React.CSSProperties = { padding: '8px', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' };
const tdLeft: React.CSSProperties = { ...td, textAlign: 'left' };
const tr: React.CSSProperties = {};
const trAlt: React.CSSProperties = { background: '#fafafa' };
