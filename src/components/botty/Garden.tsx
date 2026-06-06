'use client'
import { useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { TreeVariant } from './trees/TreeVariant'
import { Decoration } from './decorations/Decoration'
import { Terrain } from './terrains/Terrain'
import { GARDEN_DECORATION_SLOTS, clientToFraction, type PlacedDecoration } from '@/lib/garden'
import { theme as t } from '@/lib/theme'

export interface GardenProps {
  ownedTrees: string[]
  headlineTree: string
  busy?: string | null
  onSelectHeadline: (id: string) => void
  // Decorations (positioned)
  ownedDecorations: string[]
  layout: PlacedDecoration[]
  decoBusy?: boolean
  onToggleDecoration: (id: string) => void
  onMoveDecoration: (id: string, x: number, y: number) => void
  // Terrain
  ownedTerrains: string[]
  activeTerrain: string
  terrainBusy?: string | null
  onSelectTerrain: (id: string) => void
}

export function Garden({
  ownedTrees, headlineTree, busy, onSelectHeadline,
  ownedDecorations, layout, decoBusy, onToggleDecoration, onMoveDecoration,
  ownedTerrains, activeTerrain, terrainBusy, onSelectTerrain,
}: GardenProps) {
  const surfaceRef = useRef<HTMLDivElement>(null)
  const dragId = useRef<string | null>(null)
  const placedIds = new Set(layout.map((p) => p.id))
  const full = layout.length >= GARDEN_DECORATION_SLOTS

  function onPointerDown(e: ReactPointerEvent, id: string) {
    dragId.current = id
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: ReactPointerEvent, id: string) {
    if (dragId.current !== id || !surfaceRef.current) return
    const r = surfaceRef.current.getBoundingClientRect()
    const { x, y } = clientToFraction(e.clientX, e.clientY, r)
    onMoveDecoration(id, x, y) // optimistic; page persists on release via committed state
  }
  function onPointerUp(e: ReactPointerEvent, id: string) {
    if (dragId.current !== id) return
    dragId.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
    const p = layout.find((q) => q.id === id)
    if (p) onMoveDecoration(id, p.x, p.y) // final commit (page debounced persist)
  }

  return (
    <>
      <div style={plot}>
        <Terrain id={activeTerrain} style={{ borderRadius: 20 }} />
        {/* trees row (top, above terrain) */}
        <div style={{ position: 'relative', zIndex: 2 }}>
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
        </div>
        {/* decoration drag surface fills the plot */}
        <div ref={surfaceRef} style={dragSurface}>
          {layout.length === 0 && (
            <span style={hint}>
              {ownedDecorations.length === 0
                ? 'ซื้อของตกแต่งจากร้านค้าเพื่อแต่งสวน 🌷'
                : 'เลือกของตกแต่งด้านล่างมาวางในสวน'}
            </span>
          )}
          {layout.map((p) => (
            <div
              key={p.id}
              onPointerDown={(e) => onPointerDown(e, p.id)}
              onPointerMove={(e) => onPointerMove(e, p.id)}
              onPointerUp={(e) => onPointerUp(e, p.id)}
              style={{
                position: 'absolute',
                left: `${p.x * 100}%`,
                top: `${p.y * 100}%`,
                transform: 'translate(-50%, -50%)',
                touchAction: 'none',
                cursor: 'grab',
                lineHeight: 0,
                opacity: decoBusy ? 0.7 : 1,
              }}
            >
              <Decoration id={p.id} size={44} />
            </div>
          ))}
        </div>
      </div>

      {/* manage tray: add/remove which decorations are on the plot */}
      {ownedDecorations.length > 0 && (
        <div style={tray}>
          <p style={trayTitle}>ของตกแต่ง · วางได้ {layout.length}/{GARDEN_DECORATION_SLOTS}</p>
          <div style={chips}>
            {ownedDecorations.map((id) => {
              const on = placedIds.has(id)
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
  minHeight: 240,
  overflow: 'hidden',
}
const dragSurface: CSSProperties = {
  position: 'absolute',
  inset: 0,
  zIndex: 1,
}
const row: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'center',
  alignItems: 'flex-end',
  gap: 6,
}
const hint: CSSProperties = {
  position: 'absolute', left: 0, right: 0, bottom: 16,
  color: t.muted, fontSize: 12, textAlign: 'center',
}

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
