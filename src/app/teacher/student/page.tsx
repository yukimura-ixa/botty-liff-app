'use client';
import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { theme as t } from '@/lib/theme';
import { StudentScanLogsTab } from '@/components/admin/StudentScanLogsTab';
import {
  getStudent, exportToSheets, formatClassKey,
  teacherAdjustPoints, teacherCreateAdjustRequest,
  TEACHER_IMMEDIATE_CAP, TEACHER_REQUEST_CAP,
  ApiError, type StudentProfile,
} from '@/lib/api';

type StudentWithSeries = StudentProfile & { sevenDaySeries: number[] };
const DAY_LABELS = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];

function TeacherProfileContent() {
  const router = useRouter();
  const params = useSearchParams();
  const uid    = params.get('uid') ?? '';
  const [student, setStudent] = useState<StudentWithSeries | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [tab, setTab] = useState<'profile' | 'scanLogs'>('profile');

  function load() {
    if (!uid) return;
    setError('');
    getStudent(uid)
      .then(setStudent)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'โหลดข้อมูลนักเรียนไม่สำเร็จ'));
  }

  useEffect(() => { load(); }, [uid]);

  async function handleExport() {
    if (!student) return;
    setExporting(true);
    try {
      const today    = new Date().toISOString().slice(0, 10);
      const monthAgo = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
      const { url }  = await exportToSheets({ classKey: student.classKey, from: monthAgo, to: today });
      window.open(url, '_blank');
    } catch(e) { console.error(e); }
    finally { setExporting(false); }
  }

  const days = student?.sevenDaySeries ?? [0,0,0,0,0,0,0];
  const max  = Math.max(...days, 1);

  return (
    <main style={{ minHeight: '100dvh', background: t.bone, paddingBottom: 24 }}>
      <div style={{
        padding: '56px 18px 18px',
        background: `linear-gradient(180deg, ${t.forest}, ${t.moss})`,
        color: 'white', borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
      }}>
        <button onClick={() => router.back()} style={{
          background: 'none', border: 'none', color: 'inherit',
          cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, marginBottom: 12,
        }}>← กลับ</button>
        {student ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 60, height: 60, borderRadius: 30, background: 'rgba(255,255,255,0.2)', fontSize: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid rgba(255,255,255,0.3)' }}>🌱</div>
              <div><div style={{ fontSize: 18, fontWeight: 800 }}>{student.fullName}</div><div style={{ fontSize: 12, opacity: 0.85 }}>{formatClassKey(student.classKey)}</div></div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 14, fontSize: 11 }}>
              {[['คะแนน', student.totalPoints.toLocaleString()],['สตรีค',`${student.streakDays} 🔥`],['ขวด',student.totalScans],['ระดับ',student.rank]].map(([k,v]) => (
                <div key={String(k)} style={{ flex: 1, padding: '8px 6px', borderRadius: 10, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)', textAlign: 'center' }}>
                  <div style={{ opacity: 0.75, fontSize: 10, fontWeight: 600 }}>{k}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, marginTop: 2 }}>{v}</div>
                </div>
              ))}
            </div>
          </>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: 12 }}>
            <div style={{ color: t.coral, fontSize: 13, marginBottom: 10 }}>{error}</div>
            <button onClick={load} style={{
              background: 'rgba(255,255,255,0.18)', color: 'white',
              border: '1px solid rgba(255,255,255,0.3)',
              padding: '8px 20px', borderRadius: 10, fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>ลองใหม่</button>
          </div>
        ) : <div style={{ opacity: 0.6, fontSize: 13 }}>กำลังโหลด...</div>}
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '12px 16px 0' }}>
        <button onClick={() => setTab('profile')} disabled={tab === 'profile'}>โปรไฟล์</button>
        <button onClick={() => setTab('scanLogs')} disabled={tab === 'scanLogs'}>Scan Logs</button>
      </div>

      {tab === 'profile' && (
        <>
          <div style={{ padding: '14px 18px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: t.forest }}>กิจกรรม 7 วันล่าสุด</div>
              <div style={{ fontSize: 11, color: t.muted }}>{days.reduce((a,b)=>a+b,0)} ขวด รวม</div>
            </div>
            <div style={{ background: 'white', borderRadius: 14, padding: '14px 12px', border: `1px solid ${t.mint}`, display: 'flex', alignItems: 'flex-end', gap: 6, height: 100 }}>
              {days.map((d,i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                    <div style={{ width: '100%', borderRadius: '6px 6px 0 0', background: i===6?t.moss:`linear-gradient(180deg,${t.leaf},${t.moss})`, height:`${(d/max)*100}%`, minHeight: d>0?4:0, position:'relative' }}>
                      {d>0&&<div style={{ position:'absolute',top:-16,left:'50%',transform:'translateX(-50%)',fontSize:10,fontWeight:700,color:t.forest }}>{d}</div>}
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: t.muted, fontWeight: 600 }}>{DAY_LABELS[i]}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding: '14px 18px 0', display: 'flex', gap: 8 }}>
            <button onClick={() => setAdjustOpen(true)} disabled={!student} style={{ flex:1,height:42,borderRadius:10,border:`1px solid ${t.mint}`,background:'white',color:t.forest,fontSize:12.5,fontWeight:600,fontFamily:'inherit',cursor:student?'pointer':'default',opacity:student?1:0.5 }}>ปรับคะแนน</button>
            <button onClick={handleExport} disabled={exporting} style={{ flex:1,height:42,borderRadius:10,border:'none',background:t.forest,color:'white',fontSize:12.5,fontWeight:600,fontFamily:'inherit',cursor:'pointer',opacity:exporting?0.7:1 }}>{exporting?'...':'ส่งออก Sheet ↗'}</button>
          </div>
          {adjustOpen && student && (
            <AdjustModal uid={uid} student={student} onClose={() => setAdjustOpen(false)} onApplied={load} />
          )}
        </>
      )}

      {tab === 'scanLogs' && uid && (
        <div style={{ padding: 16 }}>
          <StudentScanLogsTab uid={uid} />
        </div>
      )}
    </main>
  );
}

function AdjustModal({ uid, student, onClose, onApplied }: { uid: string; student: StudentProfile; onClose: () => void; onApplied: () => void }) {
  const [delta, setDelta] = useState<string>('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const n = Number(delta);
  const valid = Number.isInteger(n) && n !== 0 && Math.abs(n) <= TEACHER_REQUEST_CAP && reason.trim().length > 0 && reason.length <= 200;
  const needsApproval = Number.isInteger(n) && Math.abs(n) > TEACHER_IMMEDIATE_CAP && Math.abs(n) <= TEACHER_REQUEST_CAP;

  async function submit() {
    if (!valid) return;
    setBusy(true); setErr(''); setOk('');
    try {
      if (needsApproval) {
        await teacherCreateAdjustRequest(uid, n, reason.trim());
        setOk(`ส่งคำขอ ${n > 0 ? '+' : ''}${n} ให้แอดมินอนุมัติแล้ว`);
      } else {
        await teacherAdjustPoints(uid, n, reason.trim());
        setOk(`ปรับ ${n > 0 ? '+' : ''}${n} เรียบร้อย`);
        onApplied();
      }
      setDelta(''); setReason('');
    } catch (e: unknown) {
      if (e instanceof ApiError) setErr(e.message);
      else setErr(e instanceof Error ? e.message : 'ปรับคะแนนไม่สำเร็จ');
    } finally { setBusy(false); }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'white', borderRadius: 16, padding: 18, width: '100%', maxWidth: 360, border: `1px solid ${t.mint}` }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: t.forest, marginBottom: 2 }}>ปรับคะแนน</div>
        <div style={{ fontSize: 11, color: t.muted, marginBottom: 14 }}>{student.fullName} · ปัจจุบัน {student.totalPoints.toLocaleString()} pts</div>

        <label style={{ display: 'block', fontSize: 11, color: t.muted, fontWeight: 600, marginBottom: 4 }}>คะแนน (±, จำนวนเต็ม)</label>
        <input
          type="number"
          step={1}
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
          placeholder="เช่น +5 หรือ -3"
          style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: `1px solid ${t.mint}`, fontSize: 14, fontWeight: 700, fontFamily: 'inherit', color: t.ink, outline: 'none', marginBottom: 10 }}
        />

        <label style={{ display: 'block', fontSize: 11, color: t.muted, fontWeight: 600, marginBottom: 4 }}>เหตุผล (จำเป็น)</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={200}
          rows={3}
          placeholder="เหตุผลการปรับคะแนน..."
          style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: `1px solid ${t.mint}`, fontSize: 13, fontFamily: 'inherit', color: t.ink, outline: 'none', resize: 'vertical', marginBottom: 8 }}
        />

        {needsApproval && (
          <div style={{ fontSize: 11, color: t.gold, padding: '8px 10px', borderRadius: 8, background: `${t.gold}22`, marginBottom: 10 }}>
            ⚠ ปรับเกิน {TEACHER_IMMEDIATE_CAP} คะแนน ต้องรอแอดมินอนุมัติ
          </div>
        )}
        {err && <div style={{ fontSize: 11, color: t.coral, marginBottom: 10 }}>{err}</div>}
        {ok && <div style={{ fontSize: 11, color: t.moss, marginBottom: 10 }}>{ok}</div>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, height: 40, borderRadius: 10, border: `1px solid ${t.mint}`, background: 'white', color: t.forest, fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>ปิด</button>
          <button onClick={submit} disabled={!valid || busy} style={{ flex: 2, height: 40, borderRadius: 10, border: 'none', background: needsApproval ? t.gold : t.forest, color: needsApproval ? t.ink : 'white', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', cursor: valid && !busy ? 'pointer' : 'default', opacity: valid && !busy ? 1 : 0.5 }}>
            {busy ? '...' : needsApproval ? 'ส่งคำขออนุมัติ' : 'ปรับเลย'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TeacherProfilePage() {
  return (
    <Suspense fallback={<div style={{ minHeight:'100dvh',background:'#FAF7EE' }}/>}>
      <TeacherProfileContent/>
    </Suspense>
  );
}
