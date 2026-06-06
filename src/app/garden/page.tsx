'use client'
import { useEffect, useRef, useState } from 'react'
import { getMe, setHeadlineTree, setGardenLayout, setActiveTerrain, type StudentProfile } from '@/lib/api'
import { Garden } from '@/components/botty/Garden'
import { GARDEN_DECORATION_SLOTS, defaultSlot, type PlacedDecoration } from '@/lib/garden'
import { theme as t } from '@/lib/theme'
import BottomNav from '@/components/shared/BottomNav'

export default function GardenPage() {
  const [me, setMe] = useState<StudentProfile | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [terrainBusy, setTerrainBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [layout, setLayout] = useState<PlacedDecoration[]>([])
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { getMe().then(setMe).catch(() => setErr('โหลดสวนไม่สำเร็จ')) }, [])

  // Sync local layout from the profile once loaded (or when profile refreshes after onboard).
  useEffect(() => {
    if (me?.decorationLayout) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-way sync from server; drag updates go the other way via persistLayout
      setLayout(me.decorationLayout)
    }
  }, [me?.decorationLayout])

  function persistLayout(next: PlacedDecoration[]) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      setGardenLayout(next).catch(() => setErr('บันทึกการจัดสวนไม่สำเร็จ'))
    }, 350)
  }

  function moveDecoration(id: string, x: number, y: number) {
    setLayout((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, x, y } : p))
      persistLayout(next)
      return next
    })
  }

  async function selectHeadline(id: string) {
    setErr(null)
    const prev = me?.headlineTree ?? 'oak'
    setBusy(id)
    setMe((m) => (m ? { ...m, headlineTree: id } : m)) // optimistic
    try {
      await setHeadlineTree(id)
    } catch {
      setMe((m) => (m ? { ...m, headlineTree: prev } : m)) // rollback
      setErr('ตั้งต้นไม้ไม่สำเร็จ')
    } finally {
      setBusy(null)
    }
  }

  function toggleDecoration(id: string) {
    setErr(null)
    setLayout((prev) => {
      const on = prev.some((p) => p.id === id)
      if (!on && prev.length >= GARDEN_DECORATION_SLOTS) return prev // full
      const next = on
        ? prev.filter((p) => p.id !== id)
        : [...prev, { id, ...defaultSlot(prev.length) }]
      persistLayout(next)
      return next
    })
  }

  async function selectTerrain(id: string) {
    setErr(null)
    const prev = me?.activeTerrain ?? 'grass'
    setTerrainBusy(id)
    setMe((m) => (m ? { ...m, activeTerrain: id } : m)) // optimistic
    try {
      await setActiveTerrain(id)
    } catch {
      setMe((m) => (m ? { ...m, activeTerrain: prev } : m)) // rollback
      setErr('ตั้งพื้นสวนไม่สำเร็จ')
    } finally {
      setTerrainBusy(null)
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: t.bone, paddingBottom: 110 }}>
      <header style={{ padding: '20px 18px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ color: t.forest, fontSize: 22, fontWeight: 800, margin: 0 }}>สวนของฉัน</h1>
        <span style={{ background: t.mint, color: t.forest, fontWeight: 700, padding: '6px 12px', borderRadius: 20 }}>
          🪙 {me?.coins ?? 0}
        </span>
      </header>
      {err && <p style={{ color: t.coral, padding: '0 18px', fontSize: 13 }}>{err}</p>}
      {me && (
        <div style={{ padding: 14 }}>
          <Garden
            ownedTrees={me.ownedTrees ?? ['oak']}
            headlineTree={me.headlineTree ?? 'oak'}
            busy={busy}
            onSelectHeadline={selectHeadline}
            ownedDecorations={me.ownedDecorations ?? []}
            layout={layout}
            onToggleDecoration={toggleDecoration}
            onMoveDecoration={moveDecoration}
            ownedTerrains={me.ownedTerrains ?? ['grass']}
            activeTerrain={me.activeTerrain ?? 'grass'}
            terrainBusy={terrainBusy}
            onSelectTerrain={selectTerrain}
          />
          <p style={{ color: t.muted, fontSize: 12, textAlign: 'center', marginTop: 10 }}>
            แตะต้นไม้เพื่อใช้เป็นต้นไม้ประจำตัว · ลากของตกแต่งเพื่อจัดวาง
          </p>
        </div>
      )}
      <BottomNav />
    </main>
  )
}
