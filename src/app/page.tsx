'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Botty from '@/components/botty/Botty';
import { theme as t } from '@/lib/theme';
import { initLiff, getLineIdToken } from '@/lib/liff';
import { authLine } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem('firebaseIdToken')) {
      const role = sessionStorage.getItem('role');
      router.replace(role === 'teacher' ? '/teacher' : '/home');
    }
  }, [router]);

  async function handleLogin() {
    try {
      setLoading(true);
      const liff = await initLiff();
      if (!liff.isLoggedIn()) return;
      const idToken = await getLineIdToken();
      const { customToken, role, onboarded } = await authLine(idToken);
      sessionStorage.setItem('firebaseCustomToken', customToken);
      sessionStorage.setItem('role', role);
      router.replace(onboarded ? (role === 'teacher' ? '/teacher' : '/home') : '/onboard');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด');
      setLoading(false);
    }
  }

  return (
    <main style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', padding: '40px 32px 60px',
      background: `linear-gradient(180deg, ${t.forest} 0%, ${t.moss} 100%)`,
      color: 'white', position: 'relative', overflow: 'hidden',
    }}>
      <LeafField />

      <div style={{ marginTop: 48, marginBottom: 22 }}>
        <div style={{
          width: 148, height: 148, borderRadius: '50%',
          background: `radial-gradient(circle at 30% 30%, ${t.leaf}33, ${t.forest}66)`,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          boxShadow: `0 30px 60px ${t.forest}88, inset 0 2px 0 rgba(255,255,255,0.25)`,
          border: '1px solid rgba(255,255,255,0.18)', position: 'relative',
        }}>
          <div style={{ position: 'absolute', bottom: -8 }}>
            <Botty pose="wave" size={110} />
          </div>
        </div>
      </div>

      <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: -1, marginBottom: 6 }}>Botty</div>
      <div style={{ fontSize: 16, opacity: 0.85, textAlign: 'center', lineHeight: 1.5, maxWidth: 280 }}>
        สแกนขวด เก็บแต้ม<br/>เปลี่ยนโลกของเราให้เขียวขึ้น
      </div>

      <div style={{
        marginTop: 32, padding: '14px 18px', borderRadius: 18,
        background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
        backdropFilter: 'blur(10px)',
        display: 'flex', gap: 22, alignItems: 'center',
      }}>
        {[['14,820', 'ขวดที่รีไซเคิล'], ['327', 'นักเรียนเข้าร่วม'], ['52kg', 'CO₂ ที่ลดได้']].map(([v, l], i) => (
          <div key={l} style={{ display: 'contents' }}>
            {i > 0 && <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.2)' }} />}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: t.gold }}>{v}</div>
              <div style={{ fontSize: 10.5, opacity: 0.75 }}>{l}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      {error && <div style={{ marginBottom: 12, fontSize: 13, color: t.coral }}>{error}</div>}

      <button
        onClick={handleLogin}
        disabled={loading}
        style={{
          width: '100%', height: 54, borderRadius: 16, border: 'none',
          background: '#06C755', color: 'white', fontSize: 17, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          boxShadow: '0 12px 24px rgba(6,199,85,0.35)', cursor: 'pointer',
          opacity: loading ? 0.7 : 1,
          fontFamily: 'inherit',
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
          <path d="M12 2C6 2 2 6 2 11c0 3 2 5.5 5 7l-1 4 4-2c.7.1 1.3.1 2 .1 6 0 10-4 10-9s-4-9-10-9z"/>
        </svg>
        {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบด้วย LINE'}
      </button>
    </main>
  );
}

function LeafField() {
  const leaves = [
    { x: 8, y: 12, r: -22, s: 1.4 }, { x: 78, y: 6, r: 35, s: 1.0 },
    { x: 88, y: 70, r: -18, s: 1.6 }, { x: 4, y: 78, r: 60, s: 1.2 },
    { x: 62, y: 88, r: 12, s: 0.9 }, { x: 30, y: 40, r: 80, s: 0.7 },
  ];
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{
      position: 'absolute', inset: 0, width: '100%', height: '100%',
      opacity: 0.18, pointerEvents: 'none',
    }}>
      {leaves.map((l, i) => (
        <g key={i} transform={`translate(${l.x} ${l.y}) rotate(${l.r}) scale(${l.s})`}>
          <path d="M0 0 C 8 -4 14 -2 16 6 C 14 10 8 12 0 8 C -2 6 -2 2 0 0 Z" fill={t.forest}/>
        </g>
      ))}
    </svg>
  );
}
