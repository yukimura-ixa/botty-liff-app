'use client'
import { useId } from 'react'
import type { ReactNode } from 'react'

// Palette per tree variant. stage 0-3 mirrors RANK_STAGE in RankTree.tsx.
const PALETTES: Record<string, { trunk: string; dark: string; mid: string; light: string }> = {
  oak:    { trunk: '#5C3A1F', dark: '#0F3D2E', mid: '#1F6E4A', light: '#3FA66B' },
  pine:   { trunk: '#4A3318', dark: '#0C3526', mid: '#1B5E3F', light: '#2E8B57' },
  sakura: { trunk: '#6B4A3A', dark: '#9E4763', mid: '#D97A98', light: '#F4B8CC' },
  willow: { trunk: '#5A4A2A', dark: '#3F5E2F', mid: '#6E8B4A', light: '#A8C97A' },
  aurora: { trunk: '#3A3A5C', dark: '#1F3D6E', mid: '#4A6EA6', light: '#9AD0F4' },
}
type Palette = (typeof PALETTES)[string]

export interface TreeVariantProps {
  variantId: string
  stage: number // 0=sapling .. 3=big
  size?: number
}

export function TreeVariant({ variantId, stage, size = 80 }: TreeVariantProps) {
  const id = variantId in PALETTES ? variantId : 'oak'
  const p = PALETTES[id]
  const s = Math.max(0, Math.min(3, stage))
  const scale = size / 80
  const canopyR = [8, 12, 16, 20][s]
  const trunkH = [10, 18, 26, 34][s]
  const cx = 40
  const groundY = 70
  const topY = groundY - trunkH // top of trunk = canopy anchor
  const gradId = useId()

  return (
    <div style={{ display: 'inline-flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <svg width={80 * scale} height={80 * scale} viewBox="0 0 80 80">
        {/* 2.5D ground shadow */}
        <ellipse cx={cx} cy={groundY + 2} rx={canopyR * 1.1} ry={canopyR * 0.32} fill="rgba(0,0,0,0.18)" />
        {/* trunk */}
        <rect x={cx - 3} y={groundY - trunkH} width={6} height={trunkH} rx={2} fill={p.trunk} />
        {/* variant-specific canopy */}
        {canopy(id, p, cx, topY, canopyR, gradId)}
      </svg>
    </div>
  )
}

function canopy(id: string, p: Palette, cx: number, topY: number, r: number, gradId: string): ReactNode {
  switch (id) {
    case 'pine':   return pineCanopy(p, cx, topY, r)
    case 'sakura': return sakuraCanopy(p, cx, topY, r)
    case 'willow': return willowCanopy(p, cx, topY, r)
    case 'aurora': return auroraCanopy(p, cx, topY, r, gradId)
    default:       return oakCanopy(p, cx, topY, r)
  }
}

function oakCanopy(p: Palette, cx: number, topY: number, r: number): ReactNode {
  return (
    <>
      <circle cx={cx} cy={topY - r * 0.4} r={r} fill={p.dark} />
      <circle cx={cx - r * 0.55} cy={topY} r={r * 0.72} fill={p.mid} />
      <circle cx={cx + r * 0.55} cy={topY} r={r * 0.72} fill={p.mid} />
      <circle cx={cx} cy={topY - r * 1.05} r={r * 0.62} fill={p.light} />
      <circle cx={cx - r * 0.4} cy={topY - r * 0.6} r={r * 0.18} fill="#fff" opacity={0.25} />
    </>
  )
}

function pineCanopy(p: Palette, cx: number, topY: number, r: number): ReactNode {
  const hw = r * 1.25
  const tierH = r * 1.0
  const bottom = topY + r * 0.3
  const tier = (cyBottom: number, halfW: number, fill: string) => (
    <polygon points={`${cx},${cyBottom - tierH} ${cx - halfW},${cyBottom} ${cx + halfW},${cyBottom}`} fill={fill} />
  )
  return (
    <>
      {tier(bottom, hw, p.dark)}
      {tier(bottom - tierH * 0.7, hw * 0.75, p.mid)}
      {tier(bottom - tierH * 1.4, hw * 0.5, p.light)}
    </>
  )
}

function sakuraCanopy(p: Palette, cx: number, topY: number, r: number): ReactNode {
  const pr = r * 0.62
  return (
    <>
      <circle cx={cx} cy={topY - r * 0.3} r={r * 0.9} fill={p.dark} />
      <circle cx={cx - r * 0.7} cy={topY - r * 0.1} r={pr} fill={p.mid} />
      <circle cx={cx + r * 0.7} cy={topY - r * 0.1} r={pr} fill={p.mid} />
      <circle cx={cx - r * 0.3} cy={topY - r * 1.0} r={pr * 0.85} fill={p.light} />
      <circle cx={cx + r * 0.4} cy={topY - r * 0.9} r={pr * 0.8} fill={p.light} />
      {/* drifting petals */}
      <circle cx={cx - r * 1.0} cy={topY + r * 0.4} r={1.4} fill={p.light} />
      <circle cx={cx + r * 0.9} cy={topY + r * 0.7} r={1.2} fill={p.mid} />
    </>
  )
}

function willowCanopy(p: Palette, cx: number, topY: number, r: number): ReactNode {
  const strand = (dx: number, len: number, col: string, key: number) => {
    const x = cx + dx
    return (
      <path
        key={key}
        d={`M ${x} ${topY - r * 0.2} Q ${x + 2} ${topY + len * 0.6} ${x - 1} ${topY + len}`}
        stroke={col}
        strokeWidth={1.6}
        fill="none"
        strokeLinecap="round"
      />
    )
  }
  return (
    <>
      <circle cx={cx} cy={topY - r * 0.4} r={r * 0.95} fill={p.dark} />
      <circle cx={cx - r * 0.4} cy={topY - r * 0.3} r={r * 0.6} fill={p.mid} />
      <circle cx={cx + r * 0.4} cy={topY - r * 0.3} r={r * 0.6} fill={p.light} />
      {strand(-r * 0.8, r * 1.3, p.mid, 0)}
      {strand(-r * 0.3, r * 1.6, p.light, 1)}
      {strand(r * 0.3, r * 1.5, p.mid, 2)}
      {strand(r * 0.8, r * 1.2, p.light, 3)}
    </>
  )
}

function auroraCanopy(p: Palette, cx: number, topY: number, r: number, gradId: string): ReactNode {
  const gid = `aurora-grad-${gradId}`
  const top = topY - r * 1.3
  const bot = topY + r * 0.4
  const hw = r * 0.95
  const midY = topY - r * 0.3
  return (
    <>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.light} />
          <stop offset="100%" stopColor={p.dark} />
        </linearGradient>
      </defs>
      <circle cx={cx} cy={topY - r * 0.4} r={r * 1.25} fill={p.light} opacity={0.25} />
      <polygon points={`${cx},${top} ${cx + hw},${midY} ${cx},${bot} ${cx - hw},${midY}`} fill={`url(#${gid})`} />
      <polygon points={`${cx},${top} ${cx + hw * 0.5},${midY} ${cx},${bot}`} fill={p.mid} opacity={0.6} />
      <circle cx={cx - r * 0.6} cy={top + r * 0.5} r={1.3} fill="#fff" />
      <circle cx={cx + r * 0.7} cy={topY} r={1} fill="#fff" />
      <circle cx={cx} cy={top + r * 0.2} r={1.4} fill="#fff" opacity={0.9} />
    </>
  )
}
