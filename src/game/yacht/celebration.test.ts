import { describe, expect, it } from 'vitest'
import { getYachtCelebration } from './celebration'

describe('Yacht difficult-combination celebration', () => {
  it('prioritizes Yacht over other matching categories', () => {
    expect(getYachtCelebration([6, 6, 6, 6, 6])).toMatchObject({ kind: 'yacht', tier: 'legendary' })
  })

  it('recognizes difficult straights and groups', () => {
    expect(getYachtCelebration([2, 3, 4, 5, 6])?.kind).toBe('largeStraight')
    expect(getYachtCelebration([4, 4, 4, 4, 2])?.kind).toBe('fourKind')
    expect(getYachtCelebration([3, 3, 3, 5, 5])?.kind).toBe('fullHouse')
    expect(getYachtCelebration([1, 2, 3, 4, 5])?.kind).toBe('smallStraight')
  })

  it('does not celebrate ordinary or invalid rolls', () => {
    expect(getYachtCelebration([1, 1, 2, 4, 6])).toBeNull()
    expect(getYachtCelebration([1, 2, 3])).toBeNull()
  })

  it('does not celebrate a difficult category that is already recorded', () => {
    expect(getYachtCelebration([2, 3, 4, 5, 6], { largeStraight: 20 })).toBeNull()
    expect(getYachtCelebration([3, 3, 3, 5, 5], { fullHouse: 0 })).toBeNull()
  })

  it('still celebrates when only an unrelated category is recorded', () => {
    expect(getYachtCelebration([4, 4, 4, 4, 2], { yacht: 0 })?.kind).toBe('fourKind')
  })
})
