'use client';
import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { theme as t } from '@/lib/theme';
import { getStudent, exportToSheets, type StudentProfile } from '@/lib/api';

type StudentWithSeries = StudentProfile & { sevenDaySeries: number[] };
const DAY_LABELS = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];

function TeacherProfileContent() {
  const router = useRouter();
  const params = useSearchParams();
  const uid    = params.get('uid') ?? '';
  const [student, setStudent] = useState<StudentWithSeries | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

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
              <div><div style={{ fontSize: 18, fontWeight: 800 }}>{student.fullName}</div><div style={{ fontSize: 12, opacity: 0.85 }}>{student.classKey}</div></div>
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
        <button style={{ flex:1,height:42,borderRadius:10,border:`1px solid ${t.mint}`,background:'white',color:t.forest,fontSize:12.5,fontWeight:600,fontFamily:'inherit',cursor:'pointer' }}>ปรับคะแนน</button>
        <button onClick={handleExport} disabled={exporting} style={{ flex:1,height:42,borderRadius:10,border:'none',background:t.forest,color:'white',fontSize:12.5,fontWeight:600,fontFamily:'inherit',cursor:'pointer',opacity:exporting?0.7:1 }}>{exporting?'...':'ส่งออก Sheet ↗'}</button>
      </div>
    </main>
  );
}

export default function TeacherProfilePage() {
  return (
    <Suspense fallback={<div style={{ minHeight:'100dvh',background:'#FAF7EE' }}/>}>
      <TeacherProfileContent/>
    </Suspense>
  );
}
