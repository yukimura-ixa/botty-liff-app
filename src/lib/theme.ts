export const theme = {
  forest: '#0F3D2E',
  moss:   '#1F6E4A',
  leaf:   '#3FA66B',
  mint:   '#C8E6D2',
  cream:  '#F5F1E6',
  bone:   '#FAF7EE',
  ink:    '#1A2620',
  muted:  '#637068',
  coral:  '#E07856',
  gold:   '#D9A441',
} as const;

export type Theme = typeof theme;

export const RANKS = [
  { k: 'ต้นกล้า', min: 0,    max: 1000, emoji: '🌱' },
  { k: 'ต้นไม้',  min: 1000, max: 1600, emoji: '🌿' },
  { k: 'ป่าไม้',  min: 1600, max: 2500, emoji: '🌳' },
  { k: 'ผืนป่า',  min: 2500, max: 5000, emoji: '🌲' },
] as const;

export function getRank(pts: number) {
  return RANKS.find(r => pts >= r.min && pts < r.max) ?? RANKS[RANKS.length - 1];
}

export function getNextRank(pts: number) {
  const cur = getRank(pts);
  const idx = RANKS.indexOf(cur as typeof RANKS[number]);
  return RANKS[idx + 1] ?? cur;
}
