import { createSpreadsheet, clearSheet, writeValues, ensureTab, spreadsheetUrl } from "./sheets-api";
import { buildScanHeader, buildScanRow, type ScanRow, type ExportOptions } from "./rows";
import { groupByStudent, groupByClass } from "./group";

export type AdjustmentRow = {
  createdAt: Date;
  targetName: string;
  teacherName: string;
  delta: number;
  reason: string;
};

export type ExportInput = {
  title: string;
  rows: ScanRow[];
  adjustments: AdjustmentRow[];
  existingId: string | null;
  opts: ExportOptions;
};

const sheetCache = new Map<string, string>();

export function cacheKeyFor(teacherUid: string, month: string): string { return `${teacherUid}:${month}`; }
export function getCachedSheet(key: string): string | undefined { return sheetCache.get(key); }
export function setCachedSheet(key: string, id: string): void { sheetCache.set(key, id); }

export async function exportSheet(input: ExportInput): Promise<{ url: string; sheetId: string }> {
  let sheetId = input.existingId ?? "";
  if (!sheetId) {
    const created = await createSpreadsheet(input.title);
    sheetId = created.id;
  } else {
    await clearSheet(sheetId, "Sheet1").catch(() => { /* ignore */ });
  }

  // Build main tab values
  let header: string[];
  let body: (string | number)[][];
  if (input.opts.groupBy === "student") {
    header = ["uid", "fullName", "classKey", "scans", "totalPoints"];
    body = groupByStudent(input.rows).map((g) => [g.uid, g.fullName, g.classKey, g.scans, g.totalPoints]);
  } else if (input.opts.groupBy === "class") {
    header = ["classKey", "scans", "totalPoints"];
    body = groupByClass(input.rows).map((g) => [g.classKey, g.scans, g.totalPoints]);
  } else {
    header = buildScanHeader(input.opts);
    body = input.rows.map((r) => buildScanRow(r, input.opts));
  }
  await writeValues(sheetId, "Sheet1!A1", [header, ...body]);

  // Optional adjustments tab
  if (input.opts.includeAdjustments && input.adjustments.length > 0) {
    await ensureTab(sheetId, "Adjustments");
    const adjHeader = ["createdAt", "targetName", "teacherName", "delta", "reason"];
    const adjBody = input.adjustments.map((a) => [a.createdAt.toISOString(), a.targetName, a.teacherName, a.delta, a.reason]);
    await writeValues(sheetId, "Adjustments!A1", [adjHeader, ...adjBody]);
  }
  return { url: await spreadsheetUrl(sheetId), sheetId };
}
