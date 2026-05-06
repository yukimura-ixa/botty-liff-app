'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/shared/BottomNav';
import { theme as t, getRank } from '@/lib/theme';
import { getMe, ApiError, type StudentProfile } from '@/lib/api';

type Status = 'loading' | 'ok' | 'error';

export default function ProfilePage() {
  const router  = useRouter();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');

  function load() {
    setStatus('loading');
    setError('');
    getMe()
      .then(p => { setProfile(p); setStatus('ok'); })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 404) {
          router.replace('/onboard');
          return;
        }
        setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ');
        setStatus('error');
      });
  }

  useEffect(() => { load(); }, []);

  async function handleLogout() {
    const { auth } = await import('@/lib/firebase');
    await auth.signOut().catch(() => {});
    sessionStorage.clear();
    router.replace('/');
  }

  if (status === 'error') {
    return (
      <main style={{
        minHeight: '100dvh', background: t.bone,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24,
      }}>
        <div style={{ fontSize: 48 }}>⚠️</div>
        <div style={{ fontSize: 14, color: t.coral, textAlign: 'center', maxWidth: 320 }}>{error}</div>
        <button onClick={load} style={{
          background: t.moss, color: 'white', border: 'none',
          padding: '12px 28px', borderRadius: 12, fontSize: 14, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>ลองใหม่</button>
      </main>
    );
  }

  const rank = getRank(profile?.totalPoints ?? 0);

  return (
    <main style={{ minHeight: '100dvh', background: t.bone, paddingBottom: 110 }}>
      {/* Header */}
      <div style={{
        background: `linear-gradient(180deg, ${t.forest}, ${t.moss})`,
        padding: '56px 20px 28px', color: 'white',
        borderBottomLeftRadius: 28, borderBottomRightRadius: 28,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 36,
            background: 'rgba(255,255,255,0.2)', border: '2px solid rgba(255,255,255,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36,
          }}>{rank.emoji}</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{profile?.nickname ?? '...'}</div>
            <div style={{ fontSize: 13, opacity: 0.85 }}>{profile?.fullName}</div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
              ม.{profile?.classGrade}/{profile?.classRoom} · {rank.k}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 18, fontSize: 12 }}>
          {[
            ['คะแนน', profile?.totalPoints.toLocaleString() ?? '—'],
            ['ขวด',   profile?.totalScans ?? '—'],
            ['สตรีค', `${profile?.streakDays ?? 0} 🔥`],
          ].map(([k, v]) => (
            <div key={k} style={{
              flex: 1, textAlign: 'center', padding: '10px 6px',
              background: 'rgba(255,255,255,0.12)', borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.18)',
            }}>
              <div style={{ opacity: 0.75, fontSize: 10, fontWeight: 600 }}>{k}</div>
              <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '20px 18px 0' }}>
        <button
          onClick={handleLogout}
          style={{
            width: '100%', height: 44, borderRadius: 12, border: `1px solid ${t.mint}`,
            background: 'white', color: t.coral, fontSize: 14, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >ออกจากระบบ</button>
      </div>

      <BottomNav />
    </main>
  );
}
