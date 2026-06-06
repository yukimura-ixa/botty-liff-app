'use client'

import { useState, type ReactNode } from 'react'
import { theme as t } from '@/lib/theme'
import { formatClassKey, type ClassEntry } from '@/lib/api'
import { TreeVariant } from '@/components/botty/trees/TreeVariant'

export function classStage(pts: number, thresholds: [number, number, number]): number {
  return thresholds.filter(th => pts >= th).length
}

const STAGE_NAME = ['ผืนดินเปล่า', 'หญ้าอ่อน', 'ดงต้นไม้เล็ก', 'ป่าอุดมสมบูรณ์']

// Trees in the class forest reuse the shared TreeVariant renderer (see
// IslandScenery) so they look identical to /garden and /shop.

// ─── Mini island chip ──────────────────────────────────────────────

function MiniIsland({ stage, active }: { stage: number; active: boolean }) {
  const grass = stage === 0 ? '#8B6F4E' : (['#3FA66B', '#1F6E4A', '#1F6E4A'] as const)[stage - 1] ?? '#1F6E4A'
  return (
    <div style={{ position: 'relative', width: 22, height: 22, flexShrink: 0 }}>
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 2, height: 10,
        borderRadius: '50%',
        background: `linear-gradient(180deg, ${grass}, #6B4F2E)`,
        boxShadow: active ? '0 0 0 1px rgba(255,255,255,0.4)' : 'none',
      }}/>
      {stage >= 1 && (
        <div style={{
          position: 'absolute', left: '50%', bottom: 6,
          transform: 'translateX(-50%)',
          fontSize: stage === 3 ? 12 : stage === 2 ? 10 : 8,
        }}>
          {stage === 3 ? '🌳' : stage === 2 ? '🌲' : '🌱'}
        </div>
      )}
    </div>
  )
}

// ─── Island body (extruded layers) ────────────────────────────────

function IslandBody({ stage }: { stage: number }) {
  const soil    = ['#8B6F4E', '#7B5E3D', '#6B4F2E', '#5C4226'][stage]
  const soilTop = ['#A88B6A', '#967751', '#866741', '#735734'][stage]
  return (
    <>
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} style={{
          position: 'absolute', left: '50%', top: '50%',
          width: 240 - i * 1.2, height: 160 - i * 0.8,
          transform: `translate(-50%, -50%) translateZ(${-i * 4}px)`,
          background: `linear-gradient(180deg, ${soilTop} 0%, ${soil} 100%)`,
          borderRadius: '50%',
        }}/>
      ))}
    </>
  )
}

// ─── Island surface (grass) ───────────────────────────────────────

function IslandSurface({ stage, mine }: { stage: number; mine: boolean }) {
  if (stage === 0) {
    return (
      <div style={{
        position: 'absolute', left: '50%', top: '50%',
        width: 240, height: 160,
        transform: 'translate(-50%, -50%) translateZ(2px)',
        borderRadius: '50%',
        background: 'radial-gradient(ellipse, #A88B6A 0%, #8B6F4E 80%)',
      }}/>
    )
  }
  const grass     = (['#3FA66B', '#1F6E4A', '#1F6E4A'] as const)[stage - 1]
  const grassDark = (['#1F6E4A', '#0F3D2E', '#0F3D2E'] as const)[stage - 1]
  return (
    <div style={{
      position: 'absolute', left: '50%', top: '50%',
      width: 240, height: 160,
      transform: 'translate(-50%, -50%) translateZ(2px)',
      borderRadius: '50%',
      background: `radial-gradient(ellipse, ${grass} 0%, ${grassDark} 90%)`,
      boxShadow: mine ? '0 0 30px #D9A44166, inset 0 0 0 2px #D9A44155' : 'none',
    }}/>
  )
}

// ─── Island scenery (trees) ───────────────────────────────────────

function IslandScenery({ stage, mine, myHeadlineTree }: { stage: number; mine: boolean; myHeadlineTree?: string }) {
  function upright(children: ReactNode, x: number, y: number) {
    return (
      <div style={{
        position: 'absolute', left: '50%', top: '50%',
        transform: `translate(-50%,-50%) translate(${x}px,${y}px) translateZ(2px) rotateX(-58deg) rotateZ(22deg)`,
        transformOrigin: 'center bottom',
      }}>
        {children}
      </div>
    )
  }

  // Generic forest tree — same renderer as /garden, default oak variant.
  const tree = (s: number, size: number) => <TreeVariant variantId="oak" stage={s} size={size} />

  if (stage === 0) return <>{upright(tree(0, 32), 0, -10)}</>
  if (stage === 1) return <>{upright(tree(1, 34), -30, -10)}{upright(tree(1, 34), 40, 10)}</>
  if (stage === 2) return (
    <>
      {upright(tree(2, 42), -50, -20)}
      {upright(tree(2, 42),  40, -30)}
      {upright(tree(2, 42),   0,  30)}
    </>
  )
  // Stage 3: the viewer's own island shows their headline variant (gold glow);
  // other classes show a generic oak forest.
  const myTree = (
    <div style={{ filter: mine ? 'drop-shadow(0 0 4px #D9A441aa)' : 'none' }}>
      <TreeVariant variantId={mine ? (myHeadlineTree ?? 'oak') : 'oak'} stage={3} size={56} />
    </div>
  )
  return (
    <>
      {upright(myTree,        -55, -25)}
      {upright(tree(3, 52),    20, -40)}
      {upright(tree(2, 42),   -20,  20)}
      {upright(tree(2, 42),    60,  10)}
    </>
  )
}

// ─── Full island ──────────────────────────────────────────────────

function Island({ stage, mine, myHeadlineTree }: { stage: number; mine: boolean; myHeadlineTree?: string }) {
  return (
    <div style={{
      position: 'absolute', left: '50%', top: '50%',
      width: 280, height: 200,
      transform: 'translate(-50%, -50%)',
      transformStyle: 'preserve-3d',
    }}>
      <IslandBody stage={stage}/>
      <IslandSurface stage={stage} mine={mine}/>
      <IslandScenery stage={stage} mine={mine} myHeadlineTree={myHeadlineTree}/>
    </div>
  )
}

// ─── Public component ─────────────────────────────────────────────

export interface ClassForestProps {
  classes: ClassEntry[]
  myClassKey: string
  thresholds: [number, number, number]
  myHeadlineTree?: string
}

export function ClassForest({ classes, myClassKey, thresholds, myHeadlineTree }: ClassForestProps) {
  const [activeIdx, setActiveIdx] = useState(0)

  if (classes.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: t.muted, padding: 40, fontSize: 14 }}>
        ยังไม่มีข้อมูลห้องเรียน
      </div>
    )
  }

  const safeIdx = Math.min(activeIdx, classes.length - 1)
  const active  = classes[safeIdx]
  const stage   = classStage(active.totalPoints, thresholds)
  const isMine  = active.classKey === myClassKey

  return (
    <div style={{
      marginTop: 8,
      background: `linear-gradient(180deg, #C9E8F2 0%, ${t.mint} 60%, ${t.cream} 100%)`,
      borderRadius: 20, border: `1px solid ${t.mint}`,
      overflow: 'hidden', position: 'relative',
    }}>
      {/* Sky decoration */}
      <div style={{
        position: 'absolute', top: 12, right: 16,
        width: 28, height: 28, borderRadius: 14,
        background: 'radial-gradient(circle at 35% 35%, #FFE9A8, #D9A441)',
        boxShadow: '0 0 20px #D9A44155',
      }}/>
      <div style={{ position: 'absolute', top: 18, left: 24, fontSize: 22, opacity: 0.85 }}>☁️</div>

      {/* Hero island */}
      <div style={{ height: 200, perspective: 1100, position: 'relative' }}>
        <div key={active.classKey} style={{
          position: 'absolute', inset: 0,
          transformStyle: 'preserve-3d',
          transform: 'rotateX(58deg) rotateZ(-22deg)',
          animation: 'bpIslandIn 0.4s ease-out',
        }}>
          <Island stage={stage} mine={isMine} myHeadlineTree={isMine ? myHeadlineTree : undefined}/>
        </div>

        {/* HUD overlay */}
        <div style={{
          position: 'absolute', left: 12, top: 12, right: 12,
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          pointerEvents: 'none',
        }}>
          <div style={{
            background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(8px)',
            padding: '6px 10px', borderRadius: 10, border: `1px solid ${t.mint}`,
            fontSize: 11.5, fontWeight: 700, color: t.forest,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {active.totalPoints === 0 ? '— ยังไม่มีอันดับ' : `${(['🥇','🥈','🥉'] as const)[safeIdx] ?? `#${safeIdx + 1}`} อันดับ #${safeIdx + 1}`}
          </div>
          <div style={{
            background: isMine ? t.forest : 'rgba(255,255,255,0.85)',
            color: isMine ? 'white' : t.forest,
            backdropFilter: 'blur(8px)',
            padding: '6px 10px', borderRadius: 10,
            border: isMine ? `1px solid #D9A441` : `1px solid ${t.mint}`,
            fontSize: 11.5, fontWeight: 700, textAlign: 'right',
          }}>
            <div style={{ fontSize: 13 }}>{formatClassKey(active.classKey)}{isMine && ' ★'}</div>
            <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.85 }}>
              {active.totalPoints === 0
                ? (active.studentCount === 0 ? 'ยังไม่มีนักเรียน' : 'ยังไม่มีนักเรียนเริ่มเก็บแต้ม')
                : `${active.totalPoints.toLocaleString()} pts · ${STAGE_NAME[stage]}`}
            </div>
          </div>
        </div>
      </div>

      {/* Class selector chips */}
      <div style={{
        background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)',
        borderTop: `1px solid ${t.mint}`, padding: '10px 12px',
      }}>
        <div style={{ fontSize: 10, color: t.muted, fontWeight: 700, letterSpacing: 0.5, marginBottom: 6 }}>
          เลือกห้องเพื่อดูป่า
        </div>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }}>
          {classes.map((cls, i) => {
            const cStage  = classStage(cls.totalPoints, thresholds)
            const cMine   = cls.classKey === myClassKey
            const isActive = i === safeIdx
            return (
              <button
                key={cls.classKey}
                onClick={() => setActiveIdx(i)}
                style={{
                  flexShrink: 0, padding: '6px 10px', borderRadius: 10,
                  background: isActive ? (cMine ? t.forest : t.moss) : 'white',
                  color: isActive ? 'white' : t.ink,
                  border: `1px solid ${isActive ? 'transparent' : t.mint}`,
                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                  minWidth: 76, fontFamily: 'inherit',
                }}
              >
                <MiniIsland stage={cStage} active={isActive}/>
                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
                  <span>{formatClassKey(cls.classKey)}</span>
                  <span style={{ fontSize: 9, fontWeight: 600, opacity: 0.85 }}>
                    {cls.totalPoints.toLocaleString()}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <style>{`
        @keyframes bpIslandIn {
          from { opacity: 0; transform: rotateX(58deg) rotateZ(-22deg) translateY(20px); }
          to   { opacity: 1; transform: rotateX(58deg) rotateZ(-22deg) translateY(0); }
        }
      `}</style>
    </div>
  )
}
