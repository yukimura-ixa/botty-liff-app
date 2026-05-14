'use client';
import { useEffect, useState } from 'react';
import BottomNav from '@/components/shared/BottomNav';
import { theme as t } from '@/lib/theme';
import { getLeaderboard, type LeaderboardEntry, type LeaderboardResponse } from '@/lib/api';

type Scope  = 'class' | 'grade' | 'school';
type Period = 'week' | 'month' | 'all';

const scopeLabels: Record<Scope, string>  = { class: 'ห้อง', grade: 'ระดับชั้น', school: 'ทั้งโรงเรียน' };
const periodLabels: Record<Period, string> = { week: 'สัปดาห์นี้', month: 'เดือนนี้', all: 'ตลอดกาล' };

const MEDALS = ['🥇', '🥈', '🥉'];

export default function LeaderboardPage() {
  const [scope,  setScope]  = useState<Scope>('class');
  const [period, setPeriod] = useState<Period>('week');
  const [data, setData]     = useState<LeaderboardResponse | null>(null);
  const [error, setError]   = useState('');

  function load(s: Scope, p: Period) {
    setData(null);
    setError('');
    getLeaderboard(s, p)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ'));
  }

  useEffect(() => { load(scope, period); }, [scope, period]);

  const top3 = (data?.entries ?? []).slice(0, 3);
  const rest  = (data?.entries ?? []).slice(3);

  return (
    <main style={{ minHeight: '100dvh', background: t.bone, paddingBottom: 110 }}>
      {/* Header */}
      <div style={{
        background: `linear-gradient(180deg, ${t.forest}, ${t.moss})`,
        padding: '56px 20px 28px', color: 'white',
        borderBottomLeftRadius: 28, borderBottomRightRadius: 28,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>กระดานอันดับ</div>
          <span style={{ fontSize: 24 }}>🏆</span>
        </div>

        {/* Scope tabs */}
        <div style={{ display: 'flex', gap: 6, marginTop: 14, background: 'rgba(0,0,0,0.18)', padding: 4, borderRadius: 12 }}>
          {(Object.keys(scopeLabels) as Scope[]).map(k => (
            <button key={k} onClick={() => setScope(k)} style={{
              flex: 1, padding: '8px 0', fontSize: 12.5, fontWeight: 700, textAlign: 'center',
              borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              background: scope === k ? 'white' : 'transparent',
              color: scope === k ? t.forest : 'rgba(255,255,255,0.85)',
            }}>{scopeLabels[k]}</button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 10, fontSize: 11.5 }}>
          {(Object.keys(periodLabels) as Period[]).map(k => (
            <button key={k} onClick={() => setPeriod(k)} style={{
              padding: '6px 12px', borderRadius: 999, border: `1px solid ${period === k ? 'rgba(255,255,255,0.3)' : 'transparent'}`,
              background: period === k ? 'rgba(255,255,255,0.2)' : 'transparent',
              color: period === k ? 'white' : 'rgba(255,255,255,0.65)',
              fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}>{periodLabels[k]}</button>
          ))}
        </div>
      </div>

      {error ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ color: t.coral, fontSize: 13, marginBottom: 12 }}>{error}</div>
          <button onClick={() => load(scope, period)} style={{
            background: t.moss, color: 'white', border: 'none',
            padding: '10px 24px', borderRadius: 12, fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>ลองใหม่</button>
        </div>
      ) : !data ? (
        <div style={{ textAlign: 'center', color: t.muted, padding: 40 }}>กำลังโหลด...</div>
      ) : data.entries.length === 0 ? (
        <div style={{ textAlign: 'center', color: t.muted, padding: 60, fontSize: 14 }}>
          ยังไม่มีข้อมูล
        </div>
      ) : (
        <>
          {/* Podium */}
          {top3.length >= 3 && (
            <div style={{ padding: '18px 20px 8px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, justifyContent: 'center' }}>
                {([top3[1], top3[0], top3[2]] as LeaderboardEntry[]).map((p, i) => {
                  const place = i === 0 ? 2 : i === 1 ? 1 : 3;
                  const h     = [86, 110, 70][i];
                  const color = ['#B8C5D0', t.gold, '#CD8967'][i];
                  return (
                    <div key={p.uid} style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{
                        width: 56, height: 56, borderRadius: 28, margin: '0 auto 6px',
                        background: 'white', border: `3px solid ${color}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
                      }}>{MEDALS[place - 1]}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: t.ink }}>{p.nickname}</div>
                      <div style={{ fontSize: 10, color: t.muted, marginBottom: 6 }}>{p.classKey}</div>
                      <div style={{
                        height: h, borderRadius: '12px 12px 0 0',
                        background: `linear-gradient(180deg, ${color}, ${color}cc)`,
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', color: 'white',
                      }}>
                        <div style={{ fontSize: 28, fontWeight: 900 }}>{place}</div>
                        <div style={{ fontSize: 11, fontWeight: 700 }}>{p.points.toLocaleString()}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* List */}
          <div style={{ padding: '12px 20px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* My row */}
            {data.myEntry && (
              <div style={{
                background: `linear-gradient(135deg, ${t.mint}, ${t.bone})`,
                border: `2px solid ${t.moss}`, borderRadius: 14, padding: '10px 12px',
                display: 'flex', alignItems: 'center', gap: 12, position: 'relative',
              }}>
                <div style={{
                  position: 'absolute', top: -8, right: 12,
                  background: t.moss, color: 'white',
                  padding: '2px 8px', borderRadius: 6,
                  fontSize: 10, fontWeight: 700,
                }}>YOU</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: t.forest, minWidth: 24 }}>{data.myRank}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{data.myEntry.nickname} · {data.myEntry.classKey}</div>
                  <div style={{ fontSize: 11, color: t.muted }}>{data.myEntry.scans} ขวด</div>
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: t.moss }}>{data.myEntry.points.toLocaleString()}</div>
              </div>
            )}

            {rest.map((s, i) => (
              <div key={s.uid} style={{
                background: 'white', borderRadius: 14, padding: '10px 12px',
                border: `1px solid ${t.mint}`, display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: t.muted, minWidth: 24 }}>{i + 4}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: t.ink }}>{s.nickname} · <span style={{ color: t.muted }}>{s.classKey}</span></div>
                  <div style={{ fontSize: 11, color: t.muted }}>{s.scans} ขวด</div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: t.forest }}>{s.points.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <BottomNav />
    </main>
  );
}
