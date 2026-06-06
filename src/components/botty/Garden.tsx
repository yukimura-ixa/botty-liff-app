'use client'
import type { CSSProperties } from 'react'
import { TreeVariant } from './trees/TreeVariant'
import { Decoration } from './decorations/Decoration'
import { Terrain } from './terrains/Terrain'
import { GARDEN_DECORATION_SLOTS } from '@/lib/garden'
import { theme as t } from '@/lib/theme'

export interface GardenProps {
  ownedTrees: string[]
  headlineTree: string
  busy?: string | null
  onSelectHeadline: (id: string) => void
  // Decorations
  ownedDecorations: string[]
  placed: string[]                       // effective list shown on the plot (<= slots)
  decoBusy?: boolean
  onToggleDecoration: (id: string) => void
  // Terrain
  ownedTerrains: string[]
  activeTerrain: string
  terrainBusy?: string | null
  onSelectTerrain: (id: string) => void
}

export function Garden({
  ownedTrees, headlineTree, busy, onSelectHeadline,
  ownedDecorations, placed, decoBusy, onToggleDecoration,
  ownedTerrains, activeTerrain, terrainBusy, onSelectTerrain,
}: GardenProps) {
  const full = placed.length >= GARDEN_DECORATION_SLOTS
  return (
    <>
      <div style={plot}>
        <Terrain id={activeTerrain} style={{ borderRadius: 20 }} />
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1, gap: 6 }}>
          {/* trees */}
          <div style={row}>
            {ownedTrees.map((id) => {
              const active = id === headlineTree
              return (
                <button
                  key={id}
                  disabled={active || busy === id}
                  onClick={() => onSelectHeadline(id)}
                  style={treeSlot(active)}
                  aria-label={active ? 'ต้นไม้ที่ใช้อยู่' : 'ใช้ต้นไม้นี้'}
                >
                  <TreeVariant variantId={id} stage={3} size={64} />
                </button>
              )
            })}
          </div>
          {/* placed decorations */}
          <div style={{ ...row, marginTop: 2 }}>
            {placed.length === 0 ? (
              <span style={hint}>
                {ownedDecorations.length === 0
                  ? 'ซื้อของตกแต่งจากร้านค้าเพื่อแต่งสวน 🌷'
                  : 'เลือกของตกแต่งด้านล่างมาวางในสวน'}
              </span>
            ) : (
              placed.map((id) => <Decoration key={id} id={id} size={44} />)
            )}
          </div>
        </div>
      </div>

      {/* manage tray: pick which decorations are on the plot */}
      {ownedDecorations.length > 0 && (
        <div style={tray}>
          <p style={trayTitle}>
            ของตกแต่ง · วางได้ {placed.length}/{GARDEN_DECORATION_SLOTS}
          </p>
          <div style={chips}>
            {ownedDecorations.map((id) => {
              const on = placed.includes(id)
              const disabled = decoBusy || (!on && full)
              return (
                <button
                  key={id}
                  disabled={disabled}
                  onClick={() => onToggleDecoration(id)}
                  style={chip(on, disabled)}
                  aria-pressed={on}
                  aria-label={on ? 'นำออกจากสวน' : 'วางในสวน'}
                >
                  <Decoration id={id} size={40} />
                  {on && <span style={check}>✓</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* terrain picker — only when student owns more than just grass */}
      {ownedTerrains.length > 1 && (
        <div style={tray}>
          <p style={trayTitle}>พื้นสวน</p>
          <div style={chips}>
            {ownedTerrains.map((id) => {
              const on = id === activeTerrain
              return (
                <button
                  key={id}
                  disabled={on || terrainBusy === id}
                  onClick={() => onSelectTerrain(id)}
                  style={{ ...chip(on, terrainBusy === id), width: 56, height: 40, overflow: 'hidden' }}
                  aria-pressed={on}
                  aria-label={on ? 'พื้นที่ใช้อยู่' : 'ใช้พื้นนี้'}
                >
                  <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                    <Terrain id={id} style={{ borderRadius: 10 }} />
                  </div>
                  {on && <span style={check}>✓</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}

const plot: CSSProperties = {
  position: 'relative',
  background: 'transparent',
  borderRadius: 22,
  padding: '18px 12px 14px',
  border: `2px solid ${t.mint}`,
  minHeight: 220,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  overflow: 'hidden',
}
const row: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'center',
  alignItems: 'flex-end',
  gap: 6,
}
const hint: CSSProperties = { color: t.muted, fontSize: 12, textAlign: 'center', padding: '14px 0' }

const tray: CSSProperties = { marginTop: 14 }
const trayTitle: CSSProperties = { color: t.forest, fontSize: 13, fontWeight: 700, margin: '0 0 8px' }
const chips: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8 }

function treeSlot(active: boolean): CSSProperties {
  return {
    background: 'transparent',
    border: active ? `2px solid ${t.moss}` : '2px solid transparent',
    borderRadius: 16,
    padding: 2,
    cursor: active ? 'default' : 'pointer',
  }
}

function chip(on: boolean, disabled: boolean): CSSProperties {
  return {
    position: 'relative',
    background: on ? t.mint : 'white',
    border: `2px solid ${on ? t.moss : t.mint}`,
    borderRadius: 14,
    padding: 4,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled && !on ? 0.45 : 1,
    lineHeight: 0,
  }
}

const check: CSSProperties = {
  position: 'absolute', top: -6, right: -6,
  background: t.moss, color: 'white', borderRadius: 10,
  fontSize: 11, fontWeight: 700, width: 18, height: 18,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
