export const CO2_KG_PER_BOTTLE = 0.012;
export function co2KgFromBottles(bottles: number): number {
  return bottles * CO2_KG_PER_BOTTLE;
}
