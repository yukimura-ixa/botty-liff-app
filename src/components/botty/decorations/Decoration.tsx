'use client'
import Image from 'next/image'
import type { ReactNode } from 'react'

// Festival decorations ship as JPG art (public/seasonal/*.jpg) instead of inline SVG.
const SEASONAL_DECORATION_ASSETS: Record<string, string> = {
  teachers_day: '/seasonal/teachers_day.jpg',
  loy_krathong: '/seasonal/loy_krathong.jpg',
  mothers_day: '/seasonal/mothers_day.jpg',
  fathers_day: '/seasonal/fathers_day.jpg',
}

export interface DecorationProps {
  id: string
  size?: number
}

export function Decoration({ id, size = 48 }: DecorationProps) {
  const asset = SEASONAL_DECORATION_ASSETS[id]
  if (asset) {
    return (
      <Image
        src={asset}
        alt=""
        width={size}
        height={size}
        style={{ objectFit: 'contain', display: 'inline-block' }}
      />
    )
  }
  const scale = size / 48
  return (
    <div style={{ display: 'inline-flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <svg width={48 * scale} height={48 * scale} viewBox="0 0 48 48">
        <ellipse cx={24} cy={40} rx={14} ry={4} fill="rgba(0,0,0,0.15)" />
        {shape(id)}
      </svg>
    </div>
  )
}

function shape(id: string): ReactNode {
  switch (id) {
    case 'rock':
      return (
        <>
          <ellipse cx={24} cy={34} rx={12} ry={8} fill="#8A8F98" />
          <ellipse cx={20} cy={31} rx={5} ry={3.5} fill="#A7ADB6" />
        </>
      )
    case 'flower_patch':
      return (
        <>
          <ellipse cx={24} cy={36} rx={13} ry={5} fill="#3FA66B" />
          {([[16, '#F4B8CC'], [24, '#FFD66B'], [32, '#9AD0F4']] as const).map(([x, c], i) => (
            <g key={i}>
              <line x1={x} y1={36} x2={x} y2={28} stroke="#1F6E4A" strokeWidth={1.4} />
              <circle cx={x} cy={26} r={3} fill={c} />
            </g>
          ))}
        </>
      )
    case 'bush':
      return (
        <>
          <circle cx={18} cy={32} r={8} fill="#1F6E4A" />
          <circle cx={30} cy={32} r={8} fill="#1F6E4A" />
          <circle cx={24} cy={26} r={9} fill="#3FA66B" />
          <circle cx={21} cy={24} r={2} fill="#fff" opacity={0.25} />
        </>
      )
    case 'log_bench':
      return (
        <>
          <rect x={10} y={28} width={28} height={7} rx={3.5} fill="#7A5230" />
          <rect x={10} y={28} width={28} height={3} rx={1.5} fill="#9A6B3F" />
          <rect x={13} y={34} width={3} height={5} fill="#5C3A1F" />
          <rect x={32} y={34} width={3} height={5} fill="#5C3A1F" />
        </>
      )
    case 'pond':
      return (
        <>
          <ellipse cx={24} cy={34} rx={15} ry={8} fill="#4A8FC2" />
          <ellipse cx={24} cy={32} rx={11} ry={5} fill="#7FB8E0" />
          <ellipse cx={20} cy={31} rx={3} ry={1.2} fill="#fff" opacity={0.6} />
        </>
      )
    case 'statue':
      return (
        <>
          <rect x={18} y={32} width={12} height={6} rx={1} fill="#9AA0A8" />
          <rect x={21} y={20} width={6} height={13} rx={2} fill="#C9B27A" />
          <circle cx={24} cy={17} r={4} fill="#E0CB8E" />
          <circle cx={24} cy={17} r={4} fill="none" stroke="#fff" strokeOpacity={0.3} />
        </>
      )
    default:
      return null
  }
}
