'use client';
import { Suspense } from 'react';
import { theme as t } from '@/lib/theme';
import { ScanLogTable } from './ScanLogTable';

export default function ScanLogsPage() {
  return (
    <main style={{ minHeight: '100dvh', background: t.bone }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 18px 56px' }}>
        <header style={{ marginBottom: 20 }}>
          <div style={{
            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
            fontSize: 10.5, letterSpacing: 2.4, textTransform: 'uppercase',
            color: t.moss, fontWeight: 600,
          }}>
            Admin · Observability
          </div>
          <h1 style={{
            fontFamily: 'var(--font-kanit), system-ui, sans-serif',
            fontWeight: 800, fontSize: 34, lineHeight: 1.1,
            margin: '6px 0 0', color: t.forest, letterSpacing: '-0.5px',
          }}>
            Scan Logs
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 13.5, color: t.muted, maxWidth: 560 }}>
            Every scan attempt — awards, previews, replays, and denials. Filter by date,
            student, class, or scan, then tap an outcome to narrow the table.
          </p>
          <div style={{
            marginTop: 16, height: 3, width: 64, borderRadius: 999,
            background: `linear-gradient(90deg, ${t.leaf}, ${t.gold})`,
          }} />
        </header>

        <Suspense fallback={<div style={{ color: t.muted, fontSize: 13 }}>Loading…</div>}>
          <ScanLogTable />
        </Suspense>
      </div>
    </main>
  );
}
