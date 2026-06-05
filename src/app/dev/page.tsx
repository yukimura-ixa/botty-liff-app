'use client'
import { useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { signInWithCustomToken } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { DEV_ACCOUNTS } from '@/server/dev/accounts'
import { theme as t } from '@/lib/theme'

const BASE = process.env.NEXT_PUBLIC_API_URL ?? '/v1'

export default function DevLoginPage() {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function loginAs(uid: string, role: string) {
    setBusy(uid); setErr(null)
    try {
      const res = await fetch(`${BASE}/dev/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid }),
      })
      if (!res.ok) throw new Error(await res.text())
      const { customToken } = (await res.json()) as { customToken: string }
      await signInWithCustomToken(auth, customToken)
      router.push(role === 'admin' ? '/admin' : '/home')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'login failed')
    } finally { setBusy(null) }
  }

  const admins = DEV_ACCOUNTS.filter((a) => a.role === 'admin')
  const students = DEV_ACCOUNTS.filter((a) => a.role === 'student')

  return (
    <main style={{ minHeight: '100vh', background: t.bone, padding: 20 }}>
      <h1 style={{ color: t.forest, fontSize: 22, fontWeight: 800 }}>Dev login</h1>
      <p style={{ color: t.muted, fontSize: 13, marginTop: 4 }}>
        Local only. Pick an account to sign in as. Seed first: <code>npx tsx scripts/seed-dev.ts --apply</code>
      </p>
      {err && <p style={{ color: t.coral, fontSize: 13 }}>{err}</p>}

      <h2 style={{ color: t.forest, fontSize: 15, marginTop: 18 }}>Admin</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {admins.map((a) => (
          <button key={a.uid} disabled={busy === a.uid} onClick={() => loginAs(a.uid, a.role)}
            style={btn(t.gold)}>
            {a.fullName}
          </button>
        ))}
      </div>

      <h2 style={{ color: t.forest, fontSize: 15, marginTop: 18 }}>Students</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {students.map((a) => (
          <button key={a.uid} disabled={busy === a.uid} onClick={() => loginAs(a.uid, a.role)}
            style={{ ...btn(t.moss), textAlign: 'left' }}>
            <strong>{a.fullName}</strong>
            <br />
            <span style={{ fontSize: 11, opacity: 0.85 }}>
              ม.{a.classGrade}/{a.classRoom} · {a.totalPoints} pts · 🪙{a.coins}
            </span>
          </button>
        ))}
      </div>
    </main>
  )
}

function btn(bg: string): CSSProperties {
  return {
    background: bg, color: 'white', border: 'none', borderRadius: 12,
    padding: '10px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
  }
}
