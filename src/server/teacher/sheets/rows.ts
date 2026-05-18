export type ScanRow = {
  uid: string;
  localDate: string;
  capturedAt: Date;
  fullName: string;
  classKey: string;
  detectedClass: string;
  itemCount: number;
  basePoints: number;
  streakBonus: number;
  totalPoints: number;
  confidence: number;
  imagePath: string;
  imageURL: string;
  streakDays: number;
};

export type ExportOptions = {
  groupBy: "scan" | "student" | "class";
  columns: string[];
  includeAdjustments: boolean;
  includeImageLinks: boolean;
};

export function defaultScanColumns(): string[] {
  return [
    "localDate", "capturedAt", "fullName", "classKey", "detectedClass",
    "itemCount", "basePoints", "streakBonus", "totalPoints", "confidence", "streakDays",
  ];
}

export function buildScanHeader(opts: ExportOptions): string[] {
  const base = opts.columns.length > 0 ? [...opts.columns] : defaultScanColumns();
  if (opts.includeImageLinks && !base.includes("imageURL")) base.push("imageURL");
  return base;
}

function cellFor(col: string, r: ScanRow): string | number {
  switch (col) {
    case "localDate":     return r.localDate;
    case "capturedAt":    return r.capturedAt.toISOString();
    case "fullName":      return r.fullName;
    case "classKey":      return r.classKey;
    case "detectedClass": return r.detectedClass;
    case "itemCount":     return r.itemCount;
    case "basePoints":    return r.basePoints;
    case "streakBonus":   return r.streakBonus;
    case "totalPoints":   return r.totalPoints;
    case "confidence":    return r.confidence;
    case "streakDays":    return r.streakDays;
    case "imageURL":      return r.imageURL || r.imagePath;
    default:              return "";
  }
}

export function buildScanRow(r: ScanRow, opts: ExportOptions): (string | number)[] {
  return buildScanHeader(opts).map((c) => cellFor(c, r));
}
