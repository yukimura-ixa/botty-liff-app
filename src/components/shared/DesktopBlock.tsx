'use client';
import { theme as t } from '@/lib/theme';

export default function DesktopBlock() {
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
        textAlign: 'center',
        gap: 24,
      }}
    >
      <div style={{ fontSize: 96, lineHeight: 1 }}>📱</div>
      <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>
        แอปนี้ใช้บนมือถือเท่านั้น
      </h1>
      <p style={{ fontSize: 16, lineHeight: 1.6, opacity: 0.9, maxWidth: 360, margin: 0 }}>
        กรุณาเปิดแอปนี้ผ่านแอป LINE บนสมาร์ทโฟนของคุณ
        <br />
        Please open this app inside the LINE mobile app.
      </p>
    </main>
  );
}
