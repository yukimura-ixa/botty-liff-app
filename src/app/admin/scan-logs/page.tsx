'use client';
import { Suspense } from 'react';
import { theme as t } from '@/lib/theme';
import { ScanLogTable } from './ScanLogTable';

export default function ScanLogsPage() {
  return (
    <main style={{ minHeight: '100dvh', background: t.bone, padding: 16 }}>
      <h1 style={{ margin: '0 0 12px' }}>Scan Logs</h1>
      <Suspense fallback={<div>Loading…</div>}>
        <ScanLogTable />
      </Suspense>
    </main>
  );
}
