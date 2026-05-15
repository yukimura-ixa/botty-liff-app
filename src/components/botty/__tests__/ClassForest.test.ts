import { describe, it, expect } from 'vitest'
import { classStage } from '../ClassForest'

describe('classStage', () => {
  const thresholds: [number, number, number] = [1000, 2500, 5000]

  it('0 pts → stage 0',             () => expect(classStage(0,     thresholds)).toBe(0))
  it('exactly t1 → stage 1',        () => expect(classStage(1000,  thresholds)).toBe(1))
  it('between t1 and t2 → stage 1', () => expect(classStage(2000,  thresholds)).toBe(1))
  it('exactly t2 → stage 2',        () => expect(classStage(2500,  thresholds)).toBe(2))
  it('exactly t3 → stage 3',        () => expect(classStage(5000,  thresholds)).toBe(3))
  it('above max → stage 3',         () => expect(classStage(99999, thresholds)).toBe(3))
})
