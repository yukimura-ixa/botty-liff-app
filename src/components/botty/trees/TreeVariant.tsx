'use client'

// Palette per tree variant. stage 0-3 mirrors RANK_STAGE in RankTree.tsx.
const PALETTES: Record<string, { trunk: string; dark: string; mid: string; light: string }> = {
  oak:    { trunk: '#5C3A1F', dark: '#0F3D2E', mid: '#1F6E4A', light: '#3FA66B' },
  pine:   { trunk: '#4A3318', dark: '#0C3526', mid: '#1B5E3F', light: '#2E8B57' },
  sakura: { trunk: '#6B4A3A', dark: '#9E4763', mid: '#D97A98', light: '#F4B8CC' },
  willow: { trunk: '#5A4A2A', dark: '#3F5E2F', mid: '#6E8B4A', light: '#A8C97A' },
  aurora: { trunk: '#3A3A5C', dark: '#1F3D6E', mid: '#4A6EA6', light: '#9AD0F4' },
}

export interface TreeVariantProps {
  variantId: string
  stage: number // 0=sapling .. 3=big
  size?: number
}

export function TreeVariant({ variantId, stage, size = 80 }: TreeVariantProps) {
  const p = PALETTES[variantId] ?? PALETTES.oak
  const s = Math.max(0, Math.min(3, stage))
  const scale = size / 80
  // canopy radius grows with stage; trunk height too
  const canopyR = [8, 12, 16, 20][s]
  const trunkH = [10, 18, 26, 34][s]
  const cx = 40
  const groundY = 70

  return (
    <div style={{ display: 'inline-flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <svg width={80 * scale} height={80 * scale} viewBox="0 0 80 80">
        {/* 2.5D ground shadow */}
        <ellipse cx={cx} cy={groundY + 2} rx={canopyR * 1.1} ry={canopyR * 0.32} fill="rgba(0,0,0,0.18)" />
        {/* trunk */}
        <rect x={cx - 3} y={groundY - trunkH} width={6} height={trunkH} rx={2} fill={p.trunk} />
        {/* canopy: layered for depth */}
        <circle cx={cx} cy={groundY - trunkH - canopyR * 0.4} r={canopyR} fill={p.dark} />
        <circle cx={cx - canopyR * 0.5} cy={groundY - trunkH} r={canopyR * 0.7} fill={p.mid} />
        <circle cx={cx + canopyR * 0.5} cy={groundY - trunkH} r={canopyR * 0.7} fill={p.mid} />
        <circle cx={cx} cy={groundY - trunkH - canopyR} r={canopyR * 0.6} fill={p.light} />
        <circle cx={cx - canopyR * 0.4} cy={groundY - trunkH - canopyR * 0.6} r={canopyR * 0.18} fill="#fff" opacity={0.25} />
      </svg>
    </div>
  )
}
