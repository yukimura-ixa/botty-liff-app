import { theme as t } from '@/lib/theme';

type Pose = 'wave' | 'thumbs' | 'yoga' | 'cool' | 'sleep' | 'cheer';

export default function Botty({ pose = 'wave', size = 80 }: { pose?: Pose; size?: number }) {
  const isSleep = pose === 'sleep';
  const eyeY = isSleep ? 56 : 54;
  const eyeShape = isSleep ? (
    <>
      <path d="M30 56 q4 -3 8 0" stroke="#1A2620" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
      <path d="M52 56 q4 -3 8 0" stroke="#1A2620" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
    </>
  ) : (
    <>
      <circle cx="34" cy={eyeY} r="2.6" fill="#1A2620"/>
      <circle cx="56" cy={eyeY} r="2.6" fill="#1A2620"/>
      <circle cx="35" cy={eyeY - 1} r="0.9" fill="white"/>
      <circle cx="57" cy={eyeY - 1} r="0.9" fill="white"/>
    </>
  );
  const mouth = (pose === 'cheer' || pose === 'thumbs')
    ? <path d="M38 64 q7 6 14 0" stroke="#1A2620" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
    : isSleep
    ? <path d="M40 64 q5 0 10 0" stroke="#1A2620" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
    : <path d="M40 64 q5 4 10 0" stroke="#1A2620" strokeWidth="1.6" fill="none" strokeLinecap="round"/>;

  const arms: Record<Pose, React.ReactNode> = {
    wave:   <><path d="M22 78 q-8 -8 -4 -18" stroke="white" strokeWidth="5" fill="none" strokeLinecap="round"/><path d="M68 80 q10 -2 12 -10" stroke="white" strokeWidth="5" fill="none" strokeLinecap="round"/></>,
    thumbs: <><path d="M22 80 q-6 -2 -8 -8" stroke="white" strokeWidth="5" fill="none" strokeLinecap="round"/><path d="M68 80 q10 -4 10 -14" stroke="white" strokeWidth="5" fill="none" strokeLinecap="round"/><circle cx="80" cy="62" r="3.5" fill="white"/></>,
    yoga:   <><path d="M22 78 q-12 4 -10 12" stroke="white" strokeWidth="5" fill="none" strokeLinecap="round"/><path d="M68 78 q12 4 10 12" stroke="white" strokeWidth="5" fill="none" strokeLinecap="round"/></>,
    cool:   <><path d="M22 80 q-4 4 -2 10" stroke="white" strokeWidth="5" fill="none" strokeLinecap="round"/><path d="M68 80 q4 4 2 10" stroke="white" strokeWidth="5" fill="none" strokeLinecap="round"/></>,
    sleep:  <><path d="M22 84 q-4 2 -4 6" stroke="white" strokeWidth="5" fill="none" strokeLinecap="round"/><path d="M68 84 q4 2 4 6" stroke="white" strokeWidth="5" fill="none" strokeLinecap="round"/></>,
    cheer:  <><path d="M22 76 q-10 -10 -6 -22" stroke="white" strokeWidth="5" fill="none" strokeLinecap="round"/><path d="M68 76 q10 -10 6 -22" stroke="white" strokeWidth="5" fill="none" strokeLinecap="round"/></>,
  };

  return (
    <svg width={size} height={size * 1.25} viewBox="0 0 90 112" style={{ overflow: 'visible' }}>
      <ellipse cx="45" cy="108" rx="22" ry="3" fill="#000" opacity=".15"/>
      {arms[pose]}
      <path d="M36 18 h18 v10 l5 8 q3 5 3 12 v44 q0 8 -8 8 h-18 q-8 0 -8 -8 v-44 q0 -7 3 -12 l5 -8 z"
        fill="white" stroke={t.moss} strokeWidth="1.5"/>
      <rect x="34" y="6" width="22" height="14" rx="3" fill={t.moss}/>
      <rect x="34" y="6" width="22" height="3" rx="1.5" fill={t.forest}/>
      <path d="M52 6 q8 -6 14 -2 q-2 8 -10 8 q-3 0 -4 -6 z" fill={t.leaf} stroke={t.moss} strokeWidth="0.6"/>
      <rect x="28" y="44" width="34" height="32" rx="3" fill={t.mint} opacity=".3"/>
      <path d="M32 30 q-2 16 0 36" stroke="white" strokeWidth="3" strokeLinecap="round" opacity=".7" fill="none"/>
      {pose === 'cool' && (
        <>
          <rect x="28" y="50" width="14" height="8" rx="2" fill="#1A2620"/>
          <rect x="48" y="50" width="14" height="8" rx="2" fill="#1A2620"/>
          <rect x="42" y="53" width="6" height="2" fill="#1A2620"/>
        </>
      )}
      {pose !== 'cool' && eyeShape}
      {mouth}
      <circle cx="28" cy="62" r="3" fill={t.coral} opacity=".4"/>
      <circle cx="62" cy="62" r="3" fill={t.coral} opacity=".4"/>
      {isSleep && <text x="68" y="34" fontSize="14" fontWeight="700" fill={t.moss}>z</text>}
    </svg>
  );
}
