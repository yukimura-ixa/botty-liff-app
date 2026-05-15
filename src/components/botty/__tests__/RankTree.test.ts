import { describe, it, expect } from 'vitest'
import { RANK_STAGE } from '../RankTree'

describe('RANK_STAGE', () => {
  it.each([
    ['ต้นกล้า', 0],
    ['ต้นไม้', 1],
    ['ป่าไม้', 2],
    ['ผืนป่า', 3],
  ] as [string, number][])('%s → stage %i', (rank, stage) => {
    expect(RANK_STAGE[rank]).toBe(stage)
  })

  it('unknown rank → fallback 0', () => {
    expect(RANK_STAGE['unknown'] ?? 0).toBe(0)
  })
})
