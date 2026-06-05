'use client'
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { getShop, shopBuy, setHeadlineTree, ApiError, type ShopItem } from '@/lib/api'
import { TreeVariant } from '@/components/botty/trees/TreeVariant'
import { theme as t } from '@/lib/theme'
import BottomNav from '@/components/shared/BottomNav'

const GATE_HINT: Record<string, string> = {
  streak_7: 'ต่อเนื่อง 7 วัน',
  rank_forest: 'ถึงระดับป่าไม้ 🌳',
  goal_half: 'เป้าหมายโรงเรียน 50%',
}

export default function ShopPage() {
  const [coins, setCoins] = useState(0)
  const [headline, setHeadline] = useState('oak')
  const [items, setItems] = useState<ShopItem[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    const r = await getShop()
    setCoins(r.coins); setHeadline(r.headlineTree); setItems(r.items)
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
  useEffect(() => { load().catch(() => setErr('โหลดร้านค้าไม่สำเร็จ')) }, [])

  async function buy(item: ShopItem) {
    setBusy(item.id); setErr(null)
    try {
      const r = await shopBuy(item.id)
      setCoins(r.coins)
      await load()
    } catch (e) {
      if (e instanceof ApiError && e.code === 'insufficient_coins') setErr('เหรียญไม่พอ')
      else if (e instanceof ApiError && e.code === 'locked') setErr('ยังปลดล็อกไม่ได้')
      else setErr('ซื้อไม่สำเร็จ')
    } finally { setBusy(null) }
  }

  async function choose(item: ShopItem) {
    setBusy(item.id)
    try { await setHeadlineTree(item.id); setHeadline(item.id) }
    catch { setErr('ตั้งต้นไม้ไม่สำเร็จ') }
    finally { setBusy(null) }
  }

  return (
    <main style={{ minHeight: '100vh', background: t.bone, paddingBottom: 110 }}>
      <header style={{ padding: '20px 18px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ color: t.forest, fontSize: 22, fontWeight: 800, margin: 0 }}>ร้านต้นไม้</h1>
        <span style={{ background: t.mint, color: t.forest, fontWeight: 700, padding: '6px 12px', borderRadius: 20 }}>
          🪙 {coins}
        </span>
      </header>
      {err && <p style={{ color: t.coral, padding: '0 18px', fontSize: 13 }}>{err}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: 14 }}>
        {items.map((item) => {
          const isHeadline = headline === item.id
          return (
            <div key={item.id} style={{
              background: 'white', borderRadius: 18, padding: 14,
              border: `2px solid ${isHeadline ? t.moss : t.mint}`,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            }}>
              <TreeVariant variantId={item.id} stage={3} size={72} />
              <strong style={{ color: t.ink, fontSize: 14 }}>{item.name}</strong>

              {item.state === 'owned' && (
                <button disabled={isHeadline || busy === item.id} onClick={() => choose(item)}
                  style={btn(isHeadline ? t.muted : t.moss)}>
                  {isHeadline ? 'กำลังใช้' : 'ใช้ต้นนี้'}
                </button>
              )}
              {item.state === 'buyable' && (
                <button disabled={busy === item.id} onClick={() => buy(item)} style={btn(t.moss)}>
                  ซื้อ 🪙{item.priceCoins}
                </button>
              )}
              {item.state === 'tooPoor' && (
                <span style={{ color: t.muted, fontSize: 13 }}>🪙{item.priceCoins}</span>
              )}
              {item.state === 'locked' && (
                <span style={{ color: t.muted, fontSize: 11, textAlign: 'center' }}>
                  🔒 {item.gate ? GATE_HINT[item.gate] ?? 'ล็อก' : 'ล็อก'}
                </span>
              )}
            </div>
          )
        })}
      </div>
      <BottomNav />
    </main>
  )
}

function btn(bg: string): CSSProperties {
  return {
    background: bg, color: 'white', border: 'none', borderRadius: 14,
    padding: '7px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer',
  }
}
