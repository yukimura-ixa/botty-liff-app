import { theme as t } from '@/lib/theme';

export default function BottleProgress({
  pct, label, height = 36,
}: {
  pct: number; label?: string; height?: number;
}) {
  const fill = Math.max(0, Math.min(100, pct));
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg width="100%" height={height} viewBox="0 0 320 36" preserveAspectRatio="none" style={{ display: 'block' }}>
        <defs>
          <clipPath id="bp-clip">
            <path d="M2 8 q0 -6 6 -6 h12 q4 0 6 -3 h12 q2 3 6 3 h264 q6 0 6 6 v20 q0 6 -6 6 h-264 q-4 0 -6 3 h-12 q-2 -3 -6 -3 h-12 q-6 0 -6 -6 z"/>
          </clipPath>
          <linearGradient id="bp-liquid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={t.leaf}/>
            <stop offset="1" stopColor={t.moss}/>
          </linearGradient>
        </defs>
        <path d="M2 8 q0 -6 6 -6 h12 q4 0 6 -3 h12 q2 3 6 3 h264 q6 0 6 6 v20 q0 6 -6 6 h-264 q-4 0 -6 3 h-12 q-2 -3 -6 -3 h-12 q-6 0 -6 -6 z"
          fill="white" stroke={t.moss} strokeWidth="1.5"/>
        <g clipPath="url(#bp-clip)">
          <rect x="0" y="0" width={`${fill}%`} height="36" fill="url(#bp-liquid)"/>
        </g>
        <rect x="0" y="0" width="6" height="36" fill={t.moss}/>
      </svg>
      {label && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700,
          color: fill > 50 ? 'white' : t.forest,
          pointerEvents: 'none',
        }}>{label}</div>
      )}
    </div>
  );
}
