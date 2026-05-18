export const CO2_KG_PER_BOTTLE = 0.012;
export function co2KgFromScans(scans: number): number {
  return scans * CO2_KG_PER_BOTTLE;
}
