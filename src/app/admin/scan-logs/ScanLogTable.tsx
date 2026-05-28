// src/app/admin/scan-logs/ScanLogTable.tsx
'use client';
import { useEffect, useState } from 'react';
import { adminListScanLogs, type AdminScanLogQuery, type AdminScanLogResponse, type AdminScanLogRow, type AdminScanLogOutcome } from '@/lib/api';

const OUTCOMES: AdminScanLogOutcome[] = [
  "awarded", "preview", "replay",
  "denied_cooldown", "denied_daily_cap",
  "denied_dup_hash", "denied_dup_phash",
  "rejected_not_pet",
];

const OUTCOME_COLORS: Record<AdminScanLogOutcome, string> = {
  awarded: "#1f8a3a",
  preview: "#5b6cff",
  replay: "#7a7a7a",
  denied_cooldown: "#b58b00",
  denied_daily_cap: "#b58b00",
  denied_dup_hash: "#c4540e",
  denied_dup_phash: "#c4540e",
  rejected_not_pet: "#b00020",
};

interface Props {
  fixedUid?: string;
  initialFrom?: string;
  initialTo?: string;
}

export function ScanLogTable({ fixedUid, initialFrom, initialTo }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(initialFrom ?? weekAgo);
  const [to, setTo] = useState(initialTo ?? today);
  const [outcomes, setOutcomes] = useState<AdminScanLogOutcome[]>([]);
  const [uid, setUid] = useState(fixedUid ?? '');
  const [classKey, setClassKey] = useState('');
  const [scanId, setScanId] = useState('');
  const [data, setData] = useState<AdminScanLogResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load(cursor: string | null = null) {
    setLoading(true);
    setError('');
    try {
      const q: AdminScanLogQuery = {
        from: from ? `${from}T00:00:00.000Z` : undefined,
        to: to ? `${to}T23:59:59.999Z` : undefined,
        outcome: outcomes.length ? outcomes : undefined,
        uid: fixedUid ?? (uid || undefined),
        classKey: classKey || undefined,
        scanId: scanId || undefined,
        cursor,
        limit: 50,
      };
      const res = await adminListScanLogs(q);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(null); /* eslint-disable-next-line */ }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label>from <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>to <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        {!fixedUid && <input placeholder="uid" value={uid} onChange={(e) => setUid(e.target.value)} />}
        {!fixedUid && <input placeholder="classKey" value={classKey} onChange={(e) => setClassKey(e.target.value)} />}
        {!fixedUid && <input placeholder="scanId" value={scanId} onChange={(e) => setScanId(e.target.value)} />}
        <select multiple value={outcomes} onChange={(e) => {
          const opts = Array.from(e.target.selectedOptions).map((o) => o.value as AdminScanLogOutcome);
          setOutcomes(opts);
        }} style={{ minWidth: 180, height: 100 }}>
          {OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <button onClick={() => load(null)} disabled={loading}>Apply</button>
      </div>

      {data && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {OUTCOMES.map((o) => (
            <span key={o} style={{
              padding: '2px 8px', borderRadius: 999, fontSize: 12,
              background: OUTCOME_COLORS[o], color: 'white',
            }}>
              {o} {data.aggregates[o] ?? 0}
            </span>
          ))}
        </div>
      )}

      {error && <div style={{ color: '#b00020' }}>{error}</div>}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', background: '#f4f4f4' }}>
              <th style={th()}>at (BKK)</th>
              <th style={th()}>uid</th>
              <th style={th()}>class</th>
              <th style={th()}>outcome</th>
              <th style={th()}>detected</th>
              <th style={th()}>conf</th>
              <th style={th()}>points</th>
              <th style={th()}>scanId</th>
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid #eee' }}>
                <td style={td()}>{formatBkk(r.at)}</td>
                <td style={td()}>
                  {fixedUid
                    ? r.uid
                    : <a href={`/teacher/student?uid=${encodeURIComponent(r.uid)}`}>{shortUid(r.uid)}</a>}
                </td>
                <td style={td()}>{r.classKey}</td>
                <td style={td()}>
                  <span style={{
                    padding: '1px 6px', borderRadius: 4, color: 'white',
                    background: OUTCOME_COLORS[r.outcome],
                  }}>{r.outcome}</span>
                </td>
                <td style={td()}>{r.detectedClass ?? '-'}</td>
                <td style={td()}>{r.confidence != null ? r.confidence.toFixed(2) : '-'}</td>
                <td style={td()}>{pointsCell(r)}</td>
                <td style={td()}>
                  <button onClick={() => navigator.clipboard.writeText(r.scanId)}
                          title="copy" style={{ fontFamily: 'monospace' }}>
                    {r.scanId.slice(0, 8)}…
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        {data?.nextCursor && (
          <button onClick={() => load(data.nextCursor)} disabled={loading}>Next page</button>
        )}
      </div>
    </div>
  );
}

function th(): React.CSSProperties { return { padding: '6px 8px', fontWeight: 600 }; }
function td(): React.CSSProperties { return { padding: '6px 8px', verticalAlign: 'top' }; }
function shortUid(u: string) { return u.length > 8 ? `${u.slice(0, 8)}…` : u; }
function formatBkk(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('th-TH-u-ca-gregory', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).format(d);
}
function pointsCell(r: AdminScanLogRow): string {
  if (r.basePoints == null && r.streakBonus == null && r.totalPoints == null) return '-';
  return `${r.basePoints ?? 0}+${r.streakBonus ?? 0}=${r.totalPoints ?? 0}`;
}
