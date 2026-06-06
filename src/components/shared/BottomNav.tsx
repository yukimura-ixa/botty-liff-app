'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactElement } from 'react';
import { theme as t } from '@/lib/theme';

type Item = { href: string; label: string; icon: (p: { color: string; size: number }) => ReactElement; primary?: boolean };

// scan is the primary action — kept dead-center (index 3 of 7).
const studentItems: Item[] = [
  { href: '/home',        label: 'หน้าหลัก', icon: HomeIcon },
  { href: '/leaderboard', label: 'อันดับ',   icon: TrophyIcon },
  { href: '/history',     label: 'ประวัติ',   icon: BottleIcon },
  { href: '/scan',        label: '',          icon: ScanIcon,  primary: true },
  { href: '/shop',        label: 'ร้านค้า',   icon: ShopIcon },
  { href: '/garden',      label: 'สวน',      icon: GardenIcon },
  { href: '/profile',     label: 'โปรไฟล์',  icon: UserIcon },
];

// Council members and admins approve scans, so their primary action is the
// staff-QR screen instead of the camera.
const staffItems: Item[] = [
  { href: '/home',        label: 'หน้าหลัก', icon: HomeIcon },
  { href: '/leaderboard', label: 'อันดับ',   icon: TrophyIcon },
  { href: '/history',     label: 'ประวัติ',   icon: BottleIcon },
  { href: '/approver',    label: '',          icon: QrIcon,    primary: true },
  { href: '/shop',        label: 'ร้านค้า',   icon: ShopIcon },
  { href: '/garden',      label: 'สวน',      icon: GardenIcon },
  { href: '/profile',     label: 'โปรไฟล์',  icon: UserIcon },
];

function isStaffRole(r: string | null): boolean {
  return r === 'council' || r === 'admin';
}

export default function BottomNav() {
  const path = usePathname();
  const [items, setItems] = useState<Item[]>(studentItems);
  useEffect(() => {
    // sessionStorage is undefined during SSR; read the role client-side in an effect.
    const r = typeof window !== 'undefined' ? sessionStorage.getItem('role') : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- role is only available client-side post-mount
    setItems(isStaffRole(r) ? staffItems : studentItems);
  }, []);
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
        const active = path.startsWith(href);
        if (primary) {
          return (
            <Link key={href} href={href} style={{
              width: 60, height: 60, borderRadius: 30, marginTop: -28,
              background: t.moss, color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 12px 24px ${t.moss}55, 0 4px 8px rgba(0,0,0,0.08)`,
              border: '4px solid white',
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
            flex: 1, minWidth: 0, maxWidth: 64,
          }}>
            <Icon color={active ? t.moss : t.muted} size={22} />
            <span style={{ fontSize: 9.5, fontWeight: active ? 600 : 500, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
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

function ShopIcon({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 7h16l-1 4a3 3 0 01-3 2.5H8A3 3 0 015 11L4 7z" stroke={color} strokeWidth="1.6" strokeLinejoin="round"/>
      <path d="M4 7l1-3h14l1 3M9 21v-5h6v5" stroke={color} strokeWidth="1.6" strokeLinejoin="round"/>
    </svg>
  );
}

function GardenIcon({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 3c2.5 2 4 4 4 6.5A4 4 0 018 9.5C8 7 9.5 5 12 3z" stroke={color} strokeWidth="1.6" strokeLinejoin="round"/>
      <path d="M12 13v8M8 21h8" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  );
}

function QrIcon({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="7" height="7" rx="1" stroke={color} strokeWidth="1.6"/>
      <rect x="14" y="3" width="7" height="7" rx="1" stroke={color} strokeWidth="1.6"/>
      <rect x="3" y="14" width="7" height="7" rx="1" stroke={color} strokeWidth="1.6"/>
      <path d="M14 14h3v3M21 14v7h-7v-3" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
