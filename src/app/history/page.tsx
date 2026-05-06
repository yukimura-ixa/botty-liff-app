'use client';
import { useEffect, useState } from 'react';
import BottomNav from '@/components/shared/BottomNav';
import { theme as t } from '@/lib/theme';
import { getMyScans, type ScanHistoryEntry } from '@/lib/api';

type Status = 'loading' | 'ok' | 'error';

export default function HistoryPage() {
  const [scans, setScans] = useState<ScanHistoryEntry[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');

  function load() {
    setStatus('loading');
    setError('');
    getMyScans()
      .then(r => {
        setScans(r.scans ?? []);
        setStatus('ok');
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ');
        setStatus('error');
      });
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <main style={{ minHeight: '100dvh', background: t.bone, paddingBottom: 110 }}>
      <div style={{ padding: '56px 18px 0' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: t.forest, marginBottom: 16 }}>ประวัติการสแกน</h1>

        {status === 'loading' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} style={{
                background: 'white', borderRadius: 14, padding: '12px 14px',
                border: `1px solid ${t.mint}`, height: 64, opacity: 0.5,
              }} />
            ))}
          </div>
        )}

        {status === 'error' && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ color: t.coral, fontSize: 13, marginBottom: 12 }}>{error}</div>
            <button onClick={load} style={{
              background: t.moss, color: 'white', border: 'none',
              padding: '10px 24px', borderRadius: 12, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>ลองใหม่</button>
          </div>
        )}

        {status === 'ok' && scans.length === 0 && (
          <div style={{ textAlign: 'center', color: t.muted, padding: 40, fontSize: 13 }}>ยังไม่มีข้อมูล</div>
        )}

        {status === 'ok' && scans.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {scans.map(s => (
              <div key={s.scanId} style={{
                background: 'white', borderRadius: 14, padding: '12px 14px',
                border: `1px solid ${t.mint}`, display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: t.mint, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>♻️</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: t.ink }}>{s.material} {s.sizeMl}ml</div>
                  <div style={{ fontSize: 11, color: t.muted }}>{new Date(s.capturedAt).toLocaleString('th-TH')}</div>
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: t.moss }}>+{s.totalPoints}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      <BottomNav />
    </main>
  );
}
