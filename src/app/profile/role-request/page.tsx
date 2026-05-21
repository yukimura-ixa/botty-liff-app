'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { theme as t } from '@/lib/theme';
import {
  getMe, getMyRoleRequest, createRoleRequest,
  ApiError, type StudentProfile, type RoleRequest,
} from '@/lib/api';

type Status = 'loading' | 'ok' | 'error';

export default function RoleRequestPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [roleReq, setRoleReq] = useState<RoleRequest | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [loadErr, setLoadErr] = useState('');

  const [role, setRole] = useState<'council' | 'teacher'>('council');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitErr, setSubmitErr] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await getMe();
        if (cancelled) return;
        setProfile(p);
        if (p.role === 'student') {
          const r = await getMyRoleRequest().catch(() => ({ request: null }));
          if (!cancelled) setRoleReq(r.request);
        }
        setStatus('ok');
      } catch (e: unknown) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) {
          router.replace('/onboard');
          return;
        }
        setLoadErr(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ');
        setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  async function submit() {
    setBusy(true);
    setSubmitErr('');
    try {
      await createRoleRequest(role, reason.trim());
      const r = await getMyRoleRequest();
      setRoleReq(r.request);
      setSubmitted(true);
      setReason('');
    } catch (e: unknown) {
      setSubmitErr(e instanceof Error ? e.message : 'ส่งคำขอไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  const isStudent = profile?.role === 'student';
  const hasPending = roleReq?.status === 'pending';
  const canSubmit = isStudent && !hasPending && !busy;

  return (
    <main style={{ minHeight: '100dvh', background: t.bone, paddingBottom: 40 }}>
      <div style={{
        background: `linear-gradient(180deg, ${t.forest}, ${t.moss})`,
        padding: '48px 20px 24px', color: 'white',
        borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
      }}>
        <button
          onClick={() => router.back()}
          style={{
            background: 'transparent', border: 'none', color: 'white',
            opacity: 0.85, fontSize: 13, padding: 0, cursor: 'pointer',
            fontFamily: 'inherit', marginBottom: 14,
          }}
        >
          ← กลับ
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>ขอสิทธิ์เจ้าหน้าที่</h1>
        <p style={{ fontSize: 12, opacity: 0.8, margin: 0, lineHeight: 1.5 }}>
          ส่งคำขอเปลี่ยนบทบาท · ผู้ดูแลระบบจะพิจารณาภายในไม่กี่วัน
        </p>
      </div>

      <div style={{ padding: '20px 18px 0' }}>
        {status === 'loading' && (
          <div style={{ padding: 32, textAlign: 'center', color: t.muted, fontSize: 13 }}>กำลังโหลด...</div>
        )}

        {status === 'error' && (
          <div style={{
            background: `${t.coral}22`, color: t.coral, borderRadius: 12,
            padding: 14, fontSize: 13, textAlign: 'center',
          }}>
            {loadErr}
          </div>
        )}

        {status === 'ok' && !isStudent && (
          <div style={{
            background: 'white', border: `1px solid ${t.mint}`, borderRadius: 14,
            padding: 16, fontSize: 13, color: t.ink, lineHeight: 1.6,
          }}>
            บัญชีของคุณเป็น <strong>{profile?.role}</strong> อยู่แล้ว ไม่จำเป็นต้องขอสิทธิ์เพิ่ม
          </div>
        )}

        {status === 'ok' && isStudent && roleReq && (
          <div style={{
            background: 'white', border: `1px solid ${t.mint}`, borderRadius: 14,
            padding: 14, marginBottom: 14,
          }}>
            <div style={{ fontSize: 11, color: t.muted, fontWeight: 700, letterSpacing: 0.5, marginBottom: 6, textTransform: 'uppercase' }}>
              คำขอล่าสุด
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ fontSize: 14, color: t.ink, fontWeight: 700 }}>
                {roleReq.requestedRole === 'council' ? 'สภานักเรียน' : 'ครู'}
              </div>
              <span style={{
                padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                background:
                  roleReq.status === 'pending' ? `${t.gold}33` :
                  roleReq.status === 'approved' ? `${t.moss}33` :
                  `${t.coral}33`,
                color:
                  roleReq.status === 'pending' ? t.forest :
                  roleReq.status === 'approved' ? t.moss :
                  t.coral,
              }}>
                {roleReq.status === 'pending' ? '⏳ รออนุมัติ' :
                 roleReq.status === 'approved' ? '✓ อนุมัติแล้ว' :
                 '✕ ปฏิเสธ'}
              </span>
            </div>
            {roleReq.reason && (
              <div style={{ fontSize: 12, color: t.muted, marginTop: 8, lineHeight: 1.5 }}>
                เหตุผล: {roleReq.reason}
              </div>
            )}
            {roleReq.status === 'denied' && roleReq.decidedReason && (
              <div style={{ fontSize: 12, color: t.coral, marginTop: 6, lineHeight: 1.5 }}>
                หมายเหตุ: {roleReq.decidedReason}
              </div>
            )}
          </div>
        )}

        {status === 'ok' && isStudent && !hasPending && (
          <div style={{
            background: 'white', border: `1px solid ${t.mint}`, borderRadius: 14,
            padding: 16,
          }}>
            <div style={{ fontSize: 12, color: t.muted, fontWeight: 600, marginBottom: 6 }}>เลือกบทบาท</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {(['council', 'teacher'] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  style={{
                    flex: 1, padding: '12px 0', borderRadius: 10,
                    background: role === r ? t.moss : 'white',
                    color: role === r ? 'white' : t.ink,
                    border: `1px solid ${role === r ? t.moss : t.mint}`,
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
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 300))}
              rows={4}
              placeholder="เช่น เป็นสมาชิกสภานักเรียนปี 67"
              style={{
                width: '100%', borderRadius: 10, padding: 10,
                border: `1px solid ${t.mint}`, fontFamily: 'inherit', fontSize: 13,
                color: t.ink, outline: 'none', resize: 'none',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ fontSize: 11, color: t.muted, textAlign: 'right', marginTop: 4 }}>
              {reason.length}/300
            </div>

            {submitErr && (
              <div style={{ fontSize: 12, color: t.coral, marginTop: 8 }}>{submitErr}</div>
            )}
            {submitted && !submitErr && (
              <div style={{ fontSize: 12, color: t.moss, marginTop: 8, fontWeight: 700 }}>
                ✓ ส่งคำขอแล้ว รอผู้ดูแลพิจารณา
              </div>
            )}

            <button
              onClick={submit}
              disabled={!canSubmit}
              style={{
                marginTop: 14, width: '100%', height: 48, borderRadius: 12,
                background: t.forest, color: 'white', border: 'none',
                fontSize: 14, fontWeight: 800, cursor: canSubmit ? 'pointer' : 'default',
                fontFamily: 'inherit', opacity: canSubmit ? 1 : 0.5,
              }}
            >
              {busy ? 'กำลังส่ง...' : 'ส่งคำขอ'}
            </button>
          </div>
        )}

        {status === 'ok' && isStudent && hasPending && (
          <div style={{
            background: 'white', border: `1px solid ${t.mint}`, borderRadius: 14,
            padding: 16, fontSize: 13, color: t.muted, lineHeight: 1.6, textAlign: 'center',
          }}>
            มีคำขอที่กำลังรอผู้ดูแลพิจารณาอยู่ — รอผลก่อนส่งคำขอใหม่
          </div>
        )}
      </div>
    </main>
  );
}
