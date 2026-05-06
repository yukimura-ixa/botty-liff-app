'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Botty from '@/components/botty/Botty';
import DesktopBlock from '@/components/shared/DesktopBlock';
import { theme as t } from '@/lib/theme';
import { initLiff, getLineIdToken } from '@/lib/liff';
import { authLine } from '@/lib/api';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '@/lib/firebase';

type Phase = 'init' | 'desktop' | 'authenticating' | 'redirecting' | 'error';

export default function LoginPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('init');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        if (sessionStorage.getItem('firebaseIdToken')) {
          router.replace('/onboard');
          return;
        }

        const liff = await initLiff();

        if (!liff.isInClient()) {
          if (!cancelled) setPhase('desktop');
          return;
        }

        if (!liff.isLoggedIn()) {
          liff.login({ redirectUri: window.location.href });
          return;
        }

        // Line login succeeded; continue with auth flow

        if (!cancelled) setPhase('authenticating');

        const idToken = await getLineIdToken();
        const { customToken, role } = await authLine(idToken);
        const cred = await signInWithCustomToken(auth, customToken);
        const firebaseIdToken = await cred.user.getIdToken();

        sessionStorage.setItem('firebaseIdToken', firebaseIdToken);
        sessionStorage.setItem('role', role);

        if (cancelled) return;
        setPhase('redirecting');
        router.replace('/onboard');
      } catch (e: unknown) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด');
        setPhase('error');
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (phase === 'desktop') return <DesktopBlock />;

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 32px',
        background: `linear-gradient(180deg, ${t.forest} 0%, ${t.moss} 100%)`,
        color: 'white',
        gap: 24,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 148,
          height: 148,
          borderRadius: '50%',
          background: `radial-gradient(circle at 30% 30%, ${t.leaf}33, ${t.forest}66)`,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          boxShadow: `0 30px 60px ${t.forest}88, inset 0 2px 0 rgba(255,255,255,0.25)`,
          border: '1px solid rgba(255,255,255,0.18)',
          position: 'relative',
        }}
      >
        <div style={{ position: 'absolute', bottom: -8 }}>
          <Botty pose="wave" size={110} />
        </div>
      </div>

      <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: -1 }}>Botty</div>

      {phase === 'error' ? (
        <>
          <div style={{ fontSize: 14, color: t.coral, maxWidth: 320 }}>{error}</div>
          <button
            onClick={() => location.reload()}
            style={{
              padding: '12px 28px',
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.3)',
              background: 'rgba(255,255,255,0.1)',
              color: 'white',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            ลองใหม่
          </button>
        </>
      ) : (
        <div style={{ fontSize: 15, opacity: 0.85 }}>
          {phase === 'authenticating' || phase === 'redirecting'
            ? 'กำลังเข้าสู่ระบบ...'
            : 'กำลังโหลด...'}
        </div>
      )}
    </main>
  );
}
