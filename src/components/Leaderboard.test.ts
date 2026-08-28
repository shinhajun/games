import { describe, expect, it } from 'vitest'
import { scoreUnit } from './leaderboardFormat'

describe('leaderboard score units', () => {
  it('shows billiards as an open-ended point total instead of the old shot limit', () => {
    expect(scoreUnit('three-cushion')).toBe(' 점')
    expect(scoreUnit('four-ball')).toBe(' 점')
  })

  it('keeps Yacht scores in points', () => {
    expect(scoreUnit('yacht')).toBe(' PTS')
  })
})
