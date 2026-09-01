import { describe, expect, it } from 'vitest'
import { BALL_SPOT_DIRECTIONS, ballSpotColor } from './ballAppearance'

describe('Pro-Cup Prestige carom ball markings', () => {
  it('places six spin-reference spots on opposite sphere axes', () => {
    expect(BALL_SPOT_DIRECTIONS).toHaveLength(6)
    expect(new Set(BALL_SPOT_DIRECTIONS.map(({ axis, sign }) => `${axis}:${sign}`))).toEqual(new Set([
      'x:1', 'x:-1', 'y:1', 'y:-1', 'z:1', 'z:-1',
    ]))
  })

  it('uses red spots on the light balls and ivory spots on both red balls', () => {
    expect(ballSpotColor('cue')).toBe('#c83a34')
    expect(ballSpotColor('yellow')).toBe('#c83a34')
    expect(ballSpotColor('red')).toBe('#f7f0dc')
    expect(ballSpotColor('red2')).toBe('#f7f0dc')
  })
})
