import type { Metadata } from 'next';
import AuthSync from '@/components/shared/AuthSync';
import { IBM_Plex_Sans_Thai, Kanit } from 'next/font/google';
import './globals.css';

const ibmPlexSansThai = IBM_Plex_Sans_Thai({
  weight: ['400', '500', '600', '700'],
  subsets: ['thai', 'latin'],
  variable: '--font-ibm-plex-thai',
  display: 'swap',
});

const kanit = Kanit({
  weight: ['700', '800'],
  subsets: ['thai', 'latin'],
  variable: '--font-kanit',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Botty — Student Recycling',
  description: 'สแกนขวด เก็บแต้ม เปลี่ยนโลกของเราให้เขียวขึ้น',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${ibmPlexSansThai.variable} ${kanit.variable}`}>
      <body style={{ fontFamily: 'var(--font-ibm-plex-thai), system-ui, sans-serif', background: '#FAF7EE', minHeight: '100dvh' }}>
        <AuthSync />
        {children}
      </body>
    </html>
  );
}
