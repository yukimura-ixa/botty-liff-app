// src/app/admin/scan-logs/ScanLogTable.tsx
'use client';
import { useEffect, useState } from 'react';
import { adminListScanLogs, type AdminScanLogQuery, type AdminScanLogResponse, type AdminScanLogRow, type AdminScanLogOutcome } from '@/lib/api';
import { theme as t } from '@/lib/theme';

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

// Shorter human labels for the chip row (the raw enum stays the query key).
const OUTCOME_LABEL: Record<AdminScanLogOutcome, string> = {
  awarded: "awarded",
  preview: "preview",
  replay: "replay",
  denied_cooldown: "cooldown",
  denied_daily_cap: "daily cap",
  denied_dup_hash: "dup hash",
  denied_dup_phash: "dup phash",
  rejected_not_pet: "not PET",
};

interface Props {
  fixedUid?: string;
  initialFrom?: string;
  initialTo?: string;
}

export function ScanLogTable({ fixedUid, initialFrom, initialTo }: Props) {
  const [from, setFrom] = useState(() => initialFrom ?? new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => initialTo ?? new Date().toISOString().slice(0, 10));
  const [outcomes, setOutcomes] = useState<AdminScanLogOutcome[]>([]);
  const [uid, setUid] = useState(fixedUid ?? '');
  const [classKey, setClassKey] = useState('');
  const [scanId, setScanId] = useState('');
  const [data, setData] = useState<AdminScanLogResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  async function load(cursor: string | null = null, outcomesArg: AdminScanLogOutcome[] = outcomes) {
    setLoading(true);
    setError('');
    try {
      const q: AdminScanLogQuery = {
        from: from ? `${from}T00:00:00.000Z` : undefined,
        to: to ? `${to}T23:59:59.999Z` : undefined,
        outcome: outcomesArg.length ? outcomesArg : undefined,
        uid: fixedUid ?? (uid || undefined),
        classKey: classKey || undefined,
        scanId: scanId || undefined,
        cursor,
        limit: 50,
      };
      const res = await adminListScanLogs(q);
      setData(res);
    } catch (e) {
      // Drop stale data so frozen aggregates/rows aren't shown as if current
      // (a failed refetch must never leave the old counts on screen). (botty-5gk)
      setData(null);
      setError(humanizeError(e));
    } finally {
      setLoading(false);
    }
  }

  // Chips double as the outcome filter: clicking toggles the outcome in/out of
  // the table query. The chip COUNTS, however, are scope totals (uid/class/date)
  // and intentionally ignore the outcome filter — see countScanAttemptsByOutcome.
  // So toggling changes which rows show, not the numbers. (botty-ax0)
  function toggleOutcome(o: AdminScanLogOutcome) {
    const next = outcomes.includes(o) ? outcomes.filter((x) => x !== o) : [...outcomes, o];
    setOutcomes(next);
    load(null, next);
  }

  function copyScanId(id: string) {
    navigator.clipboard.writeText(id);
    setCopied(id);
    setTimeout(() => setCopied((c) => (c === id ? null : c)), 1200);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch; load() sets a loading flag and is reused by Apply/pagination/chips
    load(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  const anySelected = outcomes.length > 0;

  return (
    <div className="slt-wrap">
      <style>{CSS}</style>

      {/* ── filter bar ─────────────────────────────────────────── */}
      <section className="slt-card slt-filters">
        <div className="slt-field">
          <span className="slt-label">from</span>
          <input className="slt-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="slt-field">
          <span className="slt-label">to</span>
          <input className="slt-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {!fixedUid && (
          <div className="slt-field slt-grow">
            <span className="slt-label">uid</span>
            <input className="slt-input slt-mono" placeholder="user id" value={uid} onChange={(e) => setUid(e.target.value)} />
          </div>
        )}
        {!fixedUid && (
          <div className="slt-field">
            <span className="slt-label">class</span>
            <input className="slt-input" placeholder="P1/3" value={classKey} onChange={(e) => setClassKey(e.target.value)} />
          </div>
        )}
        {!fixedUid && (
          <div className="slt-field slt-grow">
            <span className="slt-label">scanId</span>
            <input className="slt-input slt-mono" placeholder="scan id" value={scanId} onChange={(e) => setScanId(e.target.value)} />
          </div>
        )}
        <button className="slt-apply" onClick={() => load(null)} disabled={loading}>
          {loading ? 'loading…' : 'Apply'}
        </button>
      </section>

      {/* ── outcome chips ──────────────────────────────────────── */}
      {data && (
        <section className="slt-chips">
          {OUTCOMES.map((o) => {
            const active = outcomes.includes(o);
            return (
              <button key={o} onClick={() => toggleOutcome(o)} disabled={loading}
                className={`slt-chip${active ? ' is-active' : ''}${anySelected && !active ? ' is-dimmed' : ''}`}
                title={active ? 'click to remove from table filter' : 'click to filter table to this outcome'}>
                <span className="slt-dot" style={{ background: OUTCOME_COLORS[o] }} />
                <span className="slt-chip-name">{OUTCOME_LABEL[o]}</span>
                <span className="slt-chip-count">{data.aggregates[o] ?? 0}</span>
              </button>
            );
          })}
          {anySelected && (
            <button className="slt-chip-clear" onClick={() => { setOutcomes([]); load(null, []); }} disabled={loading}>
              clear filter
            </button>
          )}
          <span className="slt-hint">counts = totals in scope (ignore outcome filter)</span>
        </section>
      )}

      {error && <div className="slt-error">⚠ {error}</div>}

      {/* ── table ──────────────────────────────────────────────── */}
      <section className="slt-card slt-tablewrap">
        <div className="slt-scroll">
          <table className="slt-table">
            <thead>
              <tr>
                <th>at · BKK</th>
                <th>uid</th>
                <th>class</th>
                <th>outcome</th>
                <th>detected</th>
                <th className="slt-num">conf</th>
                <th className="slt-num">points</th>
                <th>scanId</th>
              </tr>
            </thead>
            <tbody>
              {data?.rows.map((r) => (
                <tr key={r.id}>
                  <td className="slt-mono slt-nowrap">{formatBkk(r.at)}</td>
                  <td className="slt-mono">
                    {fixedUid
                      ? r.uid
                      : <a className="slt-link" href={`/teacher/student?uid=${encodeURIComponent(r.uid)}`}>{shortUid(r.uid)}</a>}
                  </td>
                  <td>{r.classKey}</td>
                  <td>
                    <span className="slt-pill" style={{ background: OUTCOME_COLORS[r.outcome] }}>
                      {r.outcome}
                    </span>
                  </td>
                  <td>{r.detectedClass ?? <span className="slt-empty">—</span>}</td>
                  <td className="slt-num slt-mono">{r.confidence != null ? r.confidence.toFixed(2) : <span className="slt-empty">—</span>}</td>
                  <td className="slt-num slt-mono">{pointsCell(r)}</td>
                  <td>
                    <button className="slt-copy" onClick={() => copyScanId(r.scanId)} title="copy full scanId">
                      <span className="slt-mono">{r.scanId.slice(0, 8)}…</span>
                      <span className="slt-copy-tag">{copied === r.scanId ? 'copied' : 'copy'}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {data && data.rows.length === 0 && !loading && (
            <div className="slt-empty-state">No scan attempts match these filters.</div>
          )}
          {!data && loading && (
            <div className="slt-empty-state">Loading scan attempts…</div>
          )}
        </div>
      </section>

      {/* ── pagination ─────────────────────────────────────────── */}
      <div className="slt-foot">
        <span className="slt-foot-count">
          {data ? `${data.rows.length} row${data.rows.length === 1 ? '' : 's'} shown` : ''}
        </span>
        {data?.nextCursor && (
          <button className="slt-next" onClick={() => load(data.nextCursor)} disabled={loading}>
            Next page →
          </button>
        )}
      </div>
    </div>
  );
}

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
  if (r.basePoints == null && r.streakBonus == null && r.totalPoints == null) return '—';
  return `${r.basePoints ?? 0}+${r.streakBonus ?? 0}=${r.totalPoints ?? 0}`;
}

// Server routes return opaque tokens on failure (jsonError(500, "query")), which
// the api client surfaces verbatim as the error message. Translate the ones an
// admin can act on. The 500 "query" almost always means the scanAttempts
// composite indexes aren't deployed yet — see firestore.indexes.json and run
// `firebase deploy --only firestore:indexes`. (botty-5gk)
function humanizeError(e: unknown): string {
  const raw = e instanceof Error ? e.message : 'load failed';
  if (raw === 'query') return 'Could not load scan logs — the database indexes may still be deploying. Try again shortly.';
  if (raw === 'forbidden') return 'You do not have admin access.';
  if (raw === 'timeout' || raw === 'request timed out') return 'Request timed out — check your connection and retry.';
  return raw;
}

const MONO = `ui-monospace, 'SFMono-Regular', 'Cascadia Code', Menlo, Consolas, monospace`;

const CSS = `
.slt-wrap {
  font-family: var(--font-ibm-plex-thai), system-ui, sans-serif;
  color: ${t.ink};
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.slt-mono { font-family: ${MONO}; font-variant-numeric: tabular-nums; }

.slt-card {
  background: #ffffff;
  border: 1px solid rgba(15,61,46,0.10);
  border-radius: 16px;
  box-shadow: 0 1px 2px rgba(15,61,46,0.04), 0 10px 24px -18px rgba(15,61,46,0.30);
}

/* filters */
.slt-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
  padding: 16px;
}
.slt-field { display: flex; flex-direction: column; gap: 5px; }
.slt-grow { flex: 1 1 160px; min-width: 130px; }
.slt-label {
  font-size: 10px;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: ${t.muted};
  font-weight: 600;
}
.slt-input {
  appearance: none;
  border: 1px solid rgba(15,61,46,0.16);
  background: ${t.bone};
  border-radius: 10px;
  padding: 8px 11px;
  font-size: 13px;
  color: ${t.ink};
  font-family: inherit;
  transition: border-color .15s, box-shadow .15s, background .15s;
  width: 100%;
}
.slt-input::placeholder { color: rgba(99,112,104,0.6); }
.slt-input:focus {
  outline: none;
  border-color: ${t.moss};
  background: #fff;
  box-shadow: 0 0 0 3px rgba(31,110,74,0.14);
}
.slt-apply {
  margin-left: auto;
  border: none;
  cursor: pointer;
  background: ${t.forest};
  color: #fff;
  font-weight: 700;
  font-size: 13px;
  letter-spacing: .3px;
  padding: 9px 22px;
  border-radius: 10px;
  font-family: inherit;
  transition: background .15s, transform .05s;
}
.slt-apply:hover:not(:disabled) { background: ${t.moss}; }
.slt-apply:active:not(:disabled) { transform: translateY(1px); }
.slt-apply:disabled { opacity: .55; cursor: default; }

/* chips */
.slt-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.slt-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 11px 5px 9px;
  border-radius: 999px;
  border: 1.5px solid rgba(15,61,46,0.14);
  background: #fff;
  color: ${t.ink};
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color .15s, box-shadow .15s, opacity .15s, transform .05s;
}
.slt-chip:hover:not(:disabled) { border-color: rgba(15,61,46,0.34); }
.slt-chip:active:not(:disabled) { transform: translateY(1px); }
.slt-chip.is-active {
  border-color: ${t.gold};
  box-shadow: 0 0 0 2px rgba(217,164,65,0.28);
}
.slt-chip.is-dimmed { opacity: .42; }
.slt-chip:disabled { cursor: default; }
.slt-dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
.slt-chip-name { letter-spacing: .2px; }
.slt-chip-count {
  font-family: ${MONO};
  font-size: 11px;
  font-weight: 700;
  background: ${t.mint};
  color: ${t.forest};
  border-radius: 6px;
  padding: 1px 6px;
  min-width: 18px;
  text-align: center;
}
.slt-chip-clear {
  border: 1px dashed rgba(15,61,46,0.3);
  background: transparent;
  color: ${t.muted};
  font-size: 11px;
  font-weight: 600;
  padding: 5px 12px;
  border-radius: 999px;
  cursor: pointer;
  font-family: inherit;
}
.slt-chip-clear:hover:not(:disabled) { color: ${t.coral}; border-color: ${t.coral}; }
.slt-hint { font-size: 11px; color: ${t.muted}; margin-left: 4px; }

.slt-error {
  background: rgba(176,0,32,0.06);
  border: 1px solid rgba(176,0,32,0.25);
  color: #b00020;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 13px;
}

/* table */
.slt-tablewrap { padding: 0; overflow: hidden; }
.slt-scroll { overflow-x: auto; }
.slt-table { border-collapse: collapse; width: 100%; font-size: 13px; }
.slt-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  text-align: left;
  background: ${t.forest};
  color: ${t.mint};
  font-weight: 600;
  font-size: 10.5px;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  padding: 11px 14px;
  white-space: nowrap;
}
.slt-table tbody td {
  padding: 9px 14px;
  border-top: 1px solid rgba(15,61,46,0.07);
  vertical-align: middle;
  color: ${t.ink};
}
.slt-table tbody tr:nth-child(even) td { background: rgba(200,230,210,0.16); }
.slt-table tbody tr:hover td { background: ${t.mint}; }
.slt-num { text-align: right; }
.slt-nowrap { white-space: nowrap; }
.slt-empty { color: rgba(99,112,104,0.55); }

.slt-pill {
  display: inline-block;
  padding: 2px 9px;
  border-radius: 999px;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .2px;
  white-space: nowrap;
}
.slt-link { color: ${t.moss}; text-decoration: none; font-weight: 600; }
.slt-link:hover { color: ${t.forest}; text-decoration: underline; }

.slt-copy {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(15,61,46,0.14);
  background: ${t.bone};
  border-radius: 8px;
  padding: 3px 8px;
  font-size: 12px;
  color: ${t.ink};
  cursor: pointer;
  transition: border-color .15s, background .15s;
}
.slt-copy:hover { border-color: ${t.moss}; background: #fff; }
.slt-copy-tag {
  font-size: 9px;
  letter-spacing: .8px;
  text-transform: uppercase;
  color: ${t.muted};
  font-weight: 700;
}
.slt-copy:hover .slt-copy-tag { color: ${t.moss}; }

.slt-empty-state {
  padding: 40px 16px;
  text-align: center;
  color: ${t.muted};
  font-size: 13px;
}

/* footer */
.slt-foot { display: flex; align-items: center; gap: 16px; padding: 2px 2px 8px; }
.slt-foot-count { font-size: 12px; color: ${t.muted}; }
.slt-next {
  margin-left: auto;
  border: 1px solid ${t.moss};
  background: #fff;
  color: ${t.forest};
  font-weight: 700;
  font-size: 13px;
  padding: 8px 18px;
  border-radius: 10px;
  cursor: pointer;
  font-family: inherit;
  transition: background .15s, color .15s;
}
.slt-next:hover:not(:disabled) { background: ${t.moss}; color: #fff; }
.slt-next:disabled { opacity: .5; cursor: default; }
`;
