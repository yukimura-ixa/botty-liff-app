'use client';
import { ScanLogTable } from '@/app/admin/scan-logs/ScanLogTable';

export function StudentScanLogsTab({ uid }: { uid: string }) {
  return (
    <div style={{ marginTop: 12 }}>
      <ScanLogTable fixedUid={uid} />
    </div>
  );
}
