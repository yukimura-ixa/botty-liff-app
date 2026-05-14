'use client';
import QRCode from 'react-qr-code';
import { LIFF_URL } from '@/lib/liff';
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
        gap: 28,
      }}
    >
      <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: -1 }}>Botty</div>

      <div
        style={{
          background: 'white',
          borderRadius: 20,
          padding: 20,
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
        }}
      >
        <QRCode value={LIFF_URL || 'https://line.me'} size={200} />
      </div>

      <div style={{ maxWidth: 320 }}>
        <p style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>
          สแกน QR เพื่อเปิดใน LINE
        </p>
        <p style={{ fontSize: 14, opacity: 0.8, margin: 0, lineHeight: 1.6 }}>
          แอปนี้ใช้งานผ่านแอป LINE บนสมาร์ทโฟนเท่านั้น
        </p>
      </div>
    </main>
  );
}
