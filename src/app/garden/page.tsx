'use client'
import { useEffect, useState } from 'react'
import { getMe, setHeadlineTree, type StudentProfile } from '@/lib/api'
import { Garden } from '@/components/botty/Garden'
import { theme as t } from '@/lib/theme'
import BottomNav from '@/components/shared/BottomNav'

export default function GardenPage() {
  const [me, setMe] = useState<StudentProfile | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => { getMe().then(setMe).catch(() => setErr('โหลดสวนไม่สำเร็จ')) }, [])

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
            ownedDecorations={me.ownedDecorations ?? []}
            headlineTree={me.headlineTree ?? 'oak'}
            busy={busy}
            onSelectHeadline={selectHeadline}
          />
          <p style={{ color: t.muted, fontSize: 12, textAlign: 'center', marginTop: 10 }}>
            แตะต้นไม้เพื่อใช้เป็นต้นไม้ประจำตัว
          </p>
        </div>
      )}
      <BottomNav />
    </main>
  )
}
