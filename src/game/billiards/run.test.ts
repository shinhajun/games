import { describe, expect, it } from 'vitest'
import { BILLIARDS_STARTING_LIVES, settleBilliardsShot } from './run'

describe('billiards five-life run', () => {
  it('adds one point without consuming a life after a successful shot', () => {
    expect(settleBilliardsShot({ score: 3, lives: BILLIARDS_STARTING_LIVES }, true)).toEqual({
      score: 4,
      lives: BILLIARDS_STARTING_LIVES,
      finished: false,
    })
  })

  it('consumes one life without adding a point after a miss', () => {
    expect(settleBilliardsShot({ score: 3, lives: BILLIARDS_STARTING_LIVES }, false)).toEqual({
      score: 3,
      lives: BILLIARDS_STARTING_LIVES - 1,
      finished: false,
    })
  })

  it('finishes only when the fifth miss uses the final life', () => {
    expect(settleBilliardsShot({ score: 8, lives: 1 }, false)).toEqual({
      score: 8,
      lives: 0,
      finished: true,
    })
  })
})
