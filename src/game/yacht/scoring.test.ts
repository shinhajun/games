import { describe, expect, it } from 'vitest'
import { scoreYachtCategory, totalYachtScore } from './scoring'

describe('Yacht scoring', () => {
  it('scores upper categories and choice', () => {
    expect(scoreYachtCategory('threes', [3, 3, 1, 3, 6])).toBe(9)
    expect(scoreYachtCategory('choice', [3, 3, 1, 3, 6])).toBe(16)
  })

  it('uses classic Yacht combination rules', () => {
    expect(scoreYachtCategory('fourKind', [6, 6, 6, 6, 2])).toBe(24)
    expect(scoreYachtCategory('fourKind', [5, 5, 5, 5, 5])).toBe(20)
    expect(scoreYachtCategory('fullHouse', [4, 4, 4, 2, 2])).toBe(16)
    expect(scoreYachtCategory('fullHouse', [4, 4, 4, 4, 4])).toBe(0)
    expect(scoreYachtCategory('littleStraight', [5, 1, 3, 2, 4])).toBe(30)
    expect(scoreYachtCategory('bigStraight', [2, 3, 4, 5, 6])).toBe(30)
    expect(scoreYachtCategory('yacht', [2, 2, 2, 2, 2])).toBe(50)
  })

  it('totals a partial card', () => {
    expect(totalYachtScore({ ones: 3, yacht: 50, choice: 19 })).toBe(72)
  })
})
