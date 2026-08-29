import { describe, expect, it } from 'vitest'
import {
  scoreYachtCategory,
  totalYachtScore,
  upperYachtBonus,
  upperYachtSubtotal,
  YACHT_CATEGORIES,
  YACHT_MAX_SCORE,
} from './scoring'

describe('Yacht scoring', () => {
  it('scores upper categories and choice', () => {
    expect(scoreYachtCategory('threes', [3, 3, 1, 3, 6])).toBe(9)
    expect(scoreYachtCategory('choice', [3, 3, 1, 3, 6])).toBe(16)
  })

  it('scores the requested pair and matching-number categories', () => {
    expect(scoreYachtCategory('onePair', [5, 5, 4, 4, 1])).toBe(10)
    expect(scoreYachtCategory('twoPairs', [5, 5, 4, 4, 1])).toBe(18)
    expect(scoreYachtCategory('twoPairs', [5, 5, 5, 5, 1])).toBe(0)
    expect(scoreYachtCategory('threeKind', [5, 5, 5, 5, 6])).toBe(15)
    expect(scoreYachtCategory('fourKind', [5, 5, 5, 5, 6])).toBe(20)
  })

  it('uses strict Yatzy straights and full-house scoring', () => {
    expect(scoreYachtCategory('fullHouse', [5, 2, 5, 2, 5])).toBe(19)
    expect(scoreYachtCategory('fullHouse', [4, 4, 4, 4, 4])).toBe(0)
    expect(scoreYachtCategory('smallStraight', [5, 1, 3, 2, 4])).toBe(15)
    expect(scoreYachtCategory('largeStraight', [2, 3, 4, 5, 6])).toBe(20)
    expect(scoreYachtCategory('yacht', [2, 2, 2, 2, 2])).toBe(50)
  })

  it('adds a 35 point bonus when upper categories reach 63', () => {
    const upperScores = { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 }

    expect(upperYachtSubtotal(upperScores)).toBe(63)
    expect(upperYachtBonus(upperScores)).toBe(35)
    expect(totalYachtScore(upperScores)).toBe(98)
    expect(upperYachtBonus({ ...upperScores, sixes: 17 })).toBe(0)
  })

  it('totals partial cards and exposes the 15-category maximum', () => {
    expect(totalYachtScore({ ones: 3, yacht: 50, choice: 19 })).toBe(72)
    expect(YACHT_CATEGORIES).toHaveLength(15)
    expect(YACHT_CATEGORIES.reduce((sum, category) => sum + category.max, 35)).toBe(359)
    expect(YACHT_MAX_SCORE).toBe(359)
  })
})
