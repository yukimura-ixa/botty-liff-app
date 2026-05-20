'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/shared/BottomNav';
import { theme as t, getRank } from '@/lib/theme';
import {
  getMe, getMyRoleRequest, createRoleRequest,
  ApiError, type StudentProfile, type RoleRequest,
} from '@/lib/api';

type Status = 'loading' | 'ok' | 'error';

export default function ProfilePage() {
  const router  = useRouter();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');
  const [roleReq, setRoleReq] = useState<RoleRequest | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalRole, setModalRole] = useState<'council' | 'teacher'>('council');
  const [modalReason, setModalReason] = useState('');
  const [modalBusy, setModalBusy] = useState(false);
  const [modalErr, setModalErr] = useState('');

  function load() {
    setStatus('loading');
    setError('');
    getMe()
      .then(p => {
        setProfile(p);
        setStatus('ok');
        if (p.role === 'student') {
          getMyRoleRequest()
            .then(r => setRoleReq(r.request))
            .catch(() => { /* non-fatal */ });
        }
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 404) {
          router.replace('/onboard');
          return;
        }
        setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ');
        setStatus('error');
      });
  }

  useEffect(() => { load(); }, []);

  async function handleLogout() {
    const { auth } = await import('@/lib/firebase');
    await auth.signOut().catch(() => {});
    sessionStorage.clear();
    router.replace('/');
  }

  async function submitRoleRequest() {
    setModalBusy(true);
    setModalErr('');
    try {
      await createRoleRequest(modalRole, modalReason.trim());
      const r = await getMyRoleRequest();
      setRoleReq(r.request);
      setModalOpen(false);
      setModalReason('');
    } catch (e: unknown) {
      setModalErr(e instanceof Error ? e.message : 'failed');
    } finally {
      setModalBusy(false);
    }
  }

  if (status === 'error') {
    return (
      <main style={{
        minHeight: '100dvh', background: t.bone,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24,
      }}>
        <div style={{ fontSize: 48 }}>⚠️</div>
        <div style={{ fontSize: 14, color: t.coral, textAlign: 'center', maxWidth: 320 }}>{error}</div>
        <button onClick={load} style={{
          background: t.moss, color: 'white', border: 'none',
          padding: '12px 28px', borderRadius: 12, fontSize: 14, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>ลองใหม่</button>
      </main>
    );
  }

  const rank = getRank(profile?.totalPoints ?? 0);
  const isStudent = profile?.role === 'student';
  const canRequest = isStudent && (!roleReq || roleReq.status === 'denied');
  const hasPending = roleReq?.status === 'pending';

  return (
    <main style={{ minHeight: '100dvh', background: t.bone, paddingBottom: 110 }}>
      {/* Header */}
      <div style={{
        background: `linear-gradient(180deg, ${t.forest}, ${t.moss})`,
        padding: '56px 20px 28px', color: 'white',
        borderBottomLeftRadius: 28, borderBottomRightRadius: 28,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 36,
            background: 'rgba(255,255,255,0.2)', border: '2px solid rgba(255,255,255,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36,
          }}>{rank.emoji}</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{profile?.fullName ?? '...'}</div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
              ม.{profile?.classGrade}/{profile?.classRoom} · {rank.k}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 18, fontSize: 12 }}>
          {[
            ['คะแนน', profile?.totalPoints.toLocaleString() ?? '—'],
            ['ขวด',   profile?.totalScans ?? '—'],
            ['สตรีค', `${profile?.streakDays ?? 0} 🔥`],
          ].map(([k, v]) => (
            <div key={k} style={{
              flex: 1, textAlign: 'center', padding: '10px 6px',
              background: 'rgba(255,255,255,0.12)', borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.18)',
            }}>
              <div style={{ opacity: 0.75, fontSize: 10, fontWeight: 600 }}>{k}</div>
              <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '20px 18px 0' }}>
        {isStudent && (
          <div style={{
            background: 'white', border: `1px solid ${t.mint}`, borderRadius: 14,
            padding: 14, marginBottom: 14,
          }}>
            <div style={{ fontSize: 12, color: t.muted, fontWeight: 600, marginBottom: 4 }}>
              บทบาทเจ้าหน้าที่
            </div>
            {hasPending ? (
              <>
                <div style={{ fontSize: 13, color: t.ink, marginBottom: 8 }}>
                  คำขอ <strong>{roleReq?.requestedRole === 'council' ? 'สภานักเรียน' : 'ครู'}</strong> รออนุมัติ
                </div>
                <span style={{
                  display: 'inline-block', padding: '4px 10px', borderRadius: 999,
                  background: `${t.gold}33`, color: t.forest, fontSize: 11, fontWeight: 700,
                }}>
                  ⏳ รอการอนุมัติ
                </span>
              </>
            ) : (
              <>
                {roleReq?.status === 'denied' && (
                  <div style={{ fontSize: 12, color: t.coral, marginBottom: 8 }}>
                    คำขอล่าสุดถูกปฏิเสธ{roleReq.decidedReason ? ` — ${roleReq.decidedReason}` : ''}
                  </div>
                )}
                <button
                  onClick={() => setModalOpen(true)}
                  disabled={!canRequest}
                  style={{
                    width: '100%', height: 44, borderRadius: 12, border: 'none',
                    background: t.moss, color: 'white', fontSize: 13, fontWeight: 700,
                    cursor: canRequest ? 'pointer' : 'default',
                    fontFamily: 'inherit', opacity: canRequest ? 1 : 0.5,
                  }}
                >
                  ขอสิทธิ์เจ้าหน้าที่
                </button>
              </>
            )}
          </div>
        )}

        <button
          onClick={handleLogout}
          style={{
            width: '100%', height: 44, borderRadius: 12, border: `1px solid ${t.mint}`,
            background: 'white', color: t.coral, fontSize: 14, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >ออกจากระบบ</button>
      </div>

      {modalOpen && (
        <div
          onClick={() => !modalBusy && setModalOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20, zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 380, background: 'white', borderRadius: 18,
              padding: 20, color: t.ink,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 800, color: t.forest, marginBottom: 12 }}>
              ขอสิทธิ์เจ้าหน้าที่
            </div>
            <div style={{ fontSize: 12, color: t.muted, fontWeight: 600, marginBottom: 6 }}>เลือกบทบาท</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {(['council', 'teacher'] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setModalRole(r)}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 10,
                    background: modalRole === r ? t.moss : 'white',
                    color: modalRole === r ? 'white' : t.ink,
                    border: `1px solid ${modalRole === r ? t.moss : t.mint}`,
                    fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {r === 'council' ? 'สภานักเรียน' : 'ครู'}
                </button>
              ))}
            </div>

            <div style={{ fontSize: 12, color: t.muted, fontWeight: 600, marginBottom: 6 }}>
              เหตุผล (ไม่บังคับ, สูงสุด 300 ตัวอักษร)
            </div>
            <textarea
              value={modalReason}
              onChange={(e) => setModalReason(e.target.value.slice(0, 300))}
              rows={3}
              placeholder="เช่น เป็นสมาชิกสภานักเรียนปี 67"
              style={{
                width: '100%', borderRadius: 10, padding: 10,
                border: `1px solid ${t.mint}`, fontFamily: 'inherit', fontSize: 13,
                color: t.ink, outline: 'none', resize: 'none',
                boxSizing: 'border-box',
              }}
            />

            {modalErr && (
              <div style={{ fontSize: 12, color: t.coral, marginTop: 8 }}>{modalErr}</div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button
                onClick={() => setModalOpen(false)}
                disabled={modalBusy}
                style={{
                  flex: 1, height: 44, borderRadius: 10,
                  background: 'white', color: t.ink, border: `1px solid ${t.mint}`,
                  fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >ยกเลิก</button>
              <button
                onClick={submitRoleRequest}
                disabled={modalBusy}
                style={{
                  flex: 1, height: 44, borderRadius: 10,
                  background: t.forest, color: 'white', border: 'none',
                  fontSize: 13, fontWeight: 700, cursor: modalBusy ? 'default' : 'pointer',
                  fontFamily: 'inherit', opacity: modalBusy ? 0.5 : 1,
                }}
              >{modalBusy ? 'กำลังส่ง...' : 'ส่งคำขอ'}</button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </main>
  );
}
