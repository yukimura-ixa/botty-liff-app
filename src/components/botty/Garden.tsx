'use client'
import type { CSSProperties } from 'react'
import { TreeVariant } from './trees/TreeVariant'
import { Decoration } from './decorations/Decoration'
import { theme as t } from '@/lib/theme'

export interface GardenProps {
  ownedTrees: string[]
  ownedDecorations: string[]
  headlineTree: string
  busy?: string | null
  onSelectHeadline: (id: string) => void
}

export function Garden({ ownedTrees, ownedDecorations, headlineTree, busy, onSelectHeadline }: GardenProps) {
  return (
    <div style={plot}>
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
      <div style={{ ...row, marginTop: 2 }}>
        {ownedDecorations.length === 0 ? (
          <span style={hint}>ซื้อของตกแต่งจากร้านค้าเพื่อแต่งสวน 🌷</span>
        ) : (
          ownedDecorations.map((id) => <Decoration key={id} id={id} size={44} />)
        )}
      </div>
    </div>
  )
}

const plot: CSSProperties = {
  background: `linear-gradient(180deg, ${t.mint} 0%, #CDE9C9 100%)`,
  borderRadius: 22,
  padding: '18px 12px 14px',
  border: `2px solid ${t.mint}`,
  minHeight: 220,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
}
const row: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'center',
  alignItems: 'flex-end',
  gap: 6,
}
const hint: CSSProperties = { color: t.muted, fontSize: 12, textAlign: 'center', padding: '14px 0' }

function treeSlot(active: boolean): CSSProperties {
  return {
    background: 'transparent',
    border: active ? `2px solid ${t.moss}` : '2px solid transparent',
    borderRadius: 16,
    padding: 2,
    cursor: active ? 'default' : 'pointer',
  }
}
