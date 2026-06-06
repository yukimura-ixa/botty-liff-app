'use client'
import type { CSSProperties, ReactNode } from 'react'

export interface TerrainProps {
  id: string
  style?: CSSProperties
}

// Each terrain is a focused ground layer: a base gradient + optional SVG accents.
const TERRAIN_BG: Record<string, string> = {
  grass:  'linear-gradient(180deg, #BFE6B6 0%, #CDE9C9 100%)',
  sand:   'linear-gradient(180deg, #F3E2B3 0%, #E8D29A 100%)',
  meadow: 'linear-gradient(180deg, #C9E8A8 0%, #E7F0BE 100%)',
  autumn: 'linear-gradient(180deg, #E9C79A 0%, #D8A06A 100%)',
  snow:   'linear-gradient(180deg, #EAF2FA 0%, #D4E4F2 100%)',
  cosmic: 'linear-gradient(180deg, #2B2350 0%, #4B3A78 100%)',
  summer:   'linear-gradient(180deg, #FFE08A 0%, #F2C14E 100%)',
  songkran: 'linear-gradient(180deg, #BFE9F5 0%, #7FC8E8 100%)',
}

function accents(id: string): ReactNode {
  switch (id) {
    case 'meadow':
      return (
        <>
          <circle cx="22" cy="78" r="3" fill="#F4A8C0" />
          <circle cx="60" cy="84" r="3" fill="#F7D154" />
          <circle cx="84" cy="74" r="3" fill="#F4A8C0" />
        </>
      )
    case 'autumn':
      return (
        <>
          <path d="M18 74l4 4-4 4-4-4z" fill="#C75B2A" />
          <path d="M70 80l4 4-4 4-4-4z" fill="#E08A3C" />
        </>
      )
    case 'snow':
      return (
        <>
          <circle cx="24" cy="76" r="2" fill="#ffffff" />
          <circle cx="58" cy="86" r="2" fill="#ffffff" />
          <circle cx="82" cy="72" r="2" fill="#ffffff" />
        </>
      )
    case 'cosmic':
      return (
        <>
          <circle cx="20" cy="30" r="1.5" fill="#FFFFFF" />
          <circle cx="74" cy="22" r="1.5" fill="#CDB7FF" />
          <circle cx="50" cy="46" r="1.5" fill="#FFFFFF" />
          <circle cx="88" cy="54" r="1.5" fill="#CDB7FF" />
        </>
      )
    case 'sand':
      return <path d="M0 88q25 -6 50 0t50 0" stroke="#D9BE80" strokeWidth="2" fill="none" />
    case 'summer':
      return <circle cx="80" cy="20" r="8" fill="#FFF3C4" />
    case 'songkran':
      return (
        <>
          <circle cx="22" cy="78" r="3" fill="#FFFFFF" />
          <circle cx="58" cy="86" r="3" fill="#FFFFFF" />
          <circle cx="84" cy="74" r="3" fill="#FFFFFF" />
        </>
      )
    default:
      return null // grass: plain gradient
  }
}

export function Terrain({ id, style }: TerrainProps) {
  const bg = TERRAIN_BG[id] ?? TERRAIN_BG.grass
  return (
    <div style={{ position: 'absolute', inset: 0, background: bg, overflow: 'hidden', ...style }} aria-hidden>
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0 }}>
        {accents(id)}
      </svg>
    </div>
  )
}
