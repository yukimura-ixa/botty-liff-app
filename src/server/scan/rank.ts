const THRESHOLDS: readonly { min: number; name: string }[] = [
  { min: 125, name: "ผืนป่า" },
  { min: 80,  name: "ป่าไม้" },
  { min: 50,  name: "ต้นไม้" },
  { min: 0,   name: "ต้นกล้า" },
];

export function rankForPoints(pts: number): string {
  for (const r of THRESHOLDS) {
    if (pts >= r.min) return r.name;
  }
  return "ต้นกล้า";
}
