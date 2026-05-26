'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactElement } from 'react';
import { theme as t } from '@/lib/theme';

type Item = { href: string; label: string; icon: (p: { color: string; size: number }) => ReactElement; primary?: boolean };

const studentItems: Item[] = [
  { href: '/home',        label: 'หน้าหลัก', icon: HomeIcon },
  { href: '/leaderboard', label: 'อันดับ',   icon: TrophyIcon },
  { href: '/scan',        label: '',          icon: ScanIcon,  primary: true },
  { href: '/history',     label: 'ประวัติ',   icon: BottleIcon },
  { href: '/profile',     label: 'โปรไฟล์',  icon: UserIcon },
];

export default function BottomNav() {
  const path = usePathname();
  const items = studentItems;
  return (
    <nav style={{
      position: 'fixed', left: 0, right: 0, bottom: 0,
      paddingBottom: 30, paddingTop: 10, paddingInline: 14,
      background: 'rgba(255,255,255,0.92)',
      backdropFilter: 'blur(20px)',
      borderTop: `1px solid ${t.mint}`,
      display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end',
      zIndex: 50,
    }}>
      {items.map(({ href, label, icon: Icon, primary }) => {
        const active = path === href;
        if (primary) {
          return (
            <Link key={href} href={href} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 52, height: 52, borderRadius: '50%',
              background: t.moss,
              boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
              marginBottom: 8,
              textDecoration: 'none',
            }}>
              <Icon color="white" size={26} />
            </Link>
          );
        }
        return (
          <Link key={href} href={href} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            color: active ? t.moss : t.muted,
            paddingTop: 4, paddingBottom: 2,
            textDecoration: 'none',
          }}>
            <Icon color={active ? t.moss : t.muted} size={22} />
            <span style={{ fontSize: 10.5, fontWeight: active ? 600 : 500 }}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function HomeIcon({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 11l8-7 8 7v9a1 1 0 01-1 1h-4v-6h-6v6H5a1 1 0 01-1-1v-9z" stroke={color} strokeWidth="1.6" strokeLinejoin="round"/>
    </svg>
  );
}
function TrophyIcon({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M7 4h10v4a5 5 0 01-10 0V4z" stroke={color} strokeWidth="1.6" strokeLinejoin="round"/>
      <path d="M7 6H4v2a3 3 0 003 3M17 6h3v2a3 3 0 01-3 3M10 14h4v3l1 3H9l1-3v-3z" stroke={color} strokeWidth="1.6" strokeLinejoin="round"/>
    </svg>
  );
}
function ScanIcon({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M3 8V5a2 2 0 012-2h3M21 8V5a2 2 0 00-2-2h-3M3 16v3a2 2 0 002 2h3M21 16v3a2 2 0 01-2 2h-3" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M3 12h18" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  );
}
function BottleIcon({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M10 2h4v3l1.5 2.5a4 4 0 011 2.7V19a3 3 0 01-3 3h-3a3 3 0 01-3-3V10.2a4 4 0 011-2.7L10 5V2z" stroke={color} strokeWidth="1.6" strokeLinejoin="round"/>
      <path d="M9 13h6" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}
function UserIcon({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="4" stroke={color} strokeWidth="1.6"/>
      <path d="M4 21c1-4 4-6 8-6s7 2 8 6" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  );
}
