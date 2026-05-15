'use client'

export const RANK_STAGE: Record<string, number> = {
  'ต้นกล้า': 0,
  'ต้นไม้': 1,
  'ป่าไม้': 2,
  'ผืนป่า': 3,
}

function WiltSapling() {
  return (
    <svg width="28" height="32" viewBox="0 0 28 32">
      <path d="M14 30 v-12" stroke="#7B5230" strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M14 22 q-5 2 -8 6" fill="#A88B6A" stroke="#1F6E4A" strokeWidth="0.5"/>
      <path d="M14 20 q5 2 8 6" fill="#A88B6A" stroke="#1F6E4A" strokeWidth="0.5"/>
    </svg>
  )
}

function Sapling() {
  return (
    <svg width="28" height="32" viewBox="0 0 28 32">
      <path d="M14 30 v-12" stroke="#7B5230" strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M14 22 q-6 -3 -9 -1 q3 5 9 3" fill="#3FA66B" stroke="#1F6E4A" strokeWidth="0.5"/>
      <path d="M14 20 q6 -3 9 -1 q-3 5 -9 3" fill="#3FA66B" stroke="#1F6E4A" strokeWidth="0.5"/>
    </svg>
  )
}

function MidTree() {
  return (
    <svg width="36" height="50" viewBox="0 0 36 50">
      <rect x="16" y="30" width="4" height="20" rx="1.5" fill="#6B4623"/>
      <circle cx="18" cy="22" r="14" fill="#1F6E4A"/>
      <circle cx="11" cy="24" r="9"  fill="#3FA66B"/>
      <circle cx="25" cy="24" r="9"  fill="#3FA66B"/>
      <circle cx="18" cy="14" r="8"  fill="#3FA66B"/>
      <circle cx="14" cy="20" r="2.5" fill="#fff" opacity={0.25}/>
    </svg>
  )
}

function BigTree() {
  return (
    <svg width="52" height="72" viewBox="0 0 52 72">
      <rect x="23" y="40" width="6" height="32" rx="2" fill="#5C3A1F"/>
      <path d="M25 50 L16 56" stroke="#5C3A1F" strokeWidth="2" strokeLinecap="round"/>
      <path d="M27 46 L36 52" stroke="#5C3A1F" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="26" cy="28" r="20" fill="#0F3D2E"/>
      <circle cx="14" cy="34" r="13" fill="#1F6E4A"/>
      <circle cx="38" cy="34" r="13" fill="#1F6E4A"/>
      <circle cx="26" cy="14" r="11" fill="#3FA66B"/>
      <circle cx="18" cy="22" r="6"  fill="#3FA66B"/>
      <circle cx="34" cy="20" r="5"  fill="#3FA66B"/>
      <circle cx="20" cy="20" r="3"  fill="#fff" opacity={0.25}/>
    </svg>
  )
}

const STAGE_TREES = [WiltSapling, Sapling, MidTree, BigTree]

export interface RankTreeProps {
  rank: string
  animate?: boolean
  size?: number
}

export function RankTree({ rank, animate = false, size = 80 }: RankTreeProps) {
  const stage = RANK_STAGE[rank] ?? 0
  const TreeSvg = STAGE_TREES[stage]
  const scale = size / 80

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'flex-end',
      justifyContent: 'center',
      animation: animate ? 'rankTreeGrow 0.6s ease-out' : undefined,
    }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'center bottom' }}>
        <TreeSvg />
      </div>
      {animate && (
        <style>{`
          @keyframes rankTreeGrow {
            from { transform: scale(0); opacity: 0; }
            to   { transform: scale(1); opacity: 1; }
          }
        `}</style>
      )}
    </div>
  )
}
