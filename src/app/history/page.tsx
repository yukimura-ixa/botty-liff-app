'use client';
import { useEffect, useState } from 'react';
import BottomNav from '@/components/shared/BottomNav';
import { theme as t } from '@/lib/theme';
interface Scan {
  scanId: string; material: string; sizeMl: number;
  totalPoints: number; capturedAt: string;
}

async function getScans(cursor?: string) {
  const qs = cursor ? `?cursor=${cursor}` : '';
  const res = await fetch(`/v1/me/scans${qs}&limit=20`, {
    headers: { Authorization: `Bearer ${sessionStorage.getItem('firebaseIdToken') ?? ''}` },
  });
  return res.json() as Promise<{ scans: Scan[]; nextCursor?: string }>;
}

export default function HistoryPage() {
  const [scans, setScans] = useState<Scan[]>([]);

  useEffect(() => {
    getScans().then(r => setScans(r.scans)).catch(console.error);
  }, []);

  return (
    <main style={{ minHeight: '100dvh', background: t.bone, paddingBottom: 110 }}>
      <div style={{ padding: '56px 18px 0' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: t.forest, marginBottom: 16 }}>ประวัติการสแกน</h1>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {scans.length === 0 && (
            <div style={{ textAlign: 'center', color: t.muted, padding: 40, fontSize: 13 }}>ยังไม่มีข้อมูล</div>
          )}
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
      </div>
      <BottomNav />
    </main>
  );
}
