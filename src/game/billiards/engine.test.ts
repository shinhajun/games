import { describe, expect, it } from 'vitest'
import { evaluateShot, type ShotEvent } from './engine'

const cushion = (): ShotEvent => ({ type: 'cushion', rail: 'left' })

describe('billiards rules', () => {
  it('accepts three cushions before the second object ball in any object order', () => {
    expect(evaluateShot('three-cushion', [
      { type: 'ball', target: 'red' }, cushion(), cushion(), cushion(), { type: 'ball', target: 'yellow' },
    ]).success).toBe(true)
  })

  it('rejects a cushion that happens after the second object ball', () => {
    expect(evaluateShot('three-cushion', [
      cushion(), cushion(), { type: 'ball', target: 'red' }, { type: 'ball', target: 'yellow' }, cushion(),
    ]).success).toBe(false)
  })

  it('scores four-ball only when both reds are contacted without the opponent cue ball', () => {
    expect(evaluateShot('four-ball', [{ type: 'ball', target: 'red' }, { type: 'ball', target: 'red2' }]).success).toBe(true)
    expect(evaluateShot('four-ball', [
      { type: 'ball', target: 'red' }, { type: 'ball', target: 'yellow' }, { type: 'ball', target: 'red2' },
    ]).success).toBe(false)
  })
})
