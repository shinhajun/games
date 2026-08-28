import { describe, expect, it } from 'vitest'
import {
  applyShot,
  createInitialBalls,
  evaluateShot,
  getTableSpec,
  PHYSICS,
  shotSpeedForPower,
  stepPhysics,
  type ShotEvent,
} from './engine'

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

describe('regulation equipment and rigid-body physics', () => {
  it('uses distinct regulation-scale equipment for three-cushion and Korean four-ball', () => {
    const threeCushion = getTableSpec('three-cushion')
    expect(threeCushion.playingLength).toBe(2.844)
    expect(threeCushion.playingWidth).toBe(1.422)
    expect(threeCushion.ballDiameter).toBe(0.0615)
    expect(threeCushion.ballMass).toBe(0.21)

    const fourBall = getTableSpec('four-ball')
    expect(fourBall.playingLength).toBe(2.54)
    expect(fourBall.playingWidth).toBe(1.27)
    expect(fourBall.ballDiameter).toBe(0.0655)
    expect(fourBall.ballMass).toBe(0.255)
  })

  it('starts a centre-ball shot sliding, then cloth friction builds rolling spin', () => {
    const cue = createInitialBalls('three-cushion')[0]
    applyShot(cue, 'three-cushion', 0, 50, { x: 0, y: 0 }, 'normal')

    expect(cue.velocity.x).toBeCloseTo(shotSpeedForPower(50, 'normal'), 6)
    expect(cue.velocity.y).toBeCloseTo(0, 6)
    expect(cue.angularVelocity.z).toBeCloseTo(0, 12)

    stepPhysics([cue], 'three-cushion', 1 / 120, () => undefined)
    expect(cue.angularVelocity.z).toBeLessThan(0)
  })

  it('uses a progressive power curve with a full-power carom shot above 6m/s', () => {
    expect(shotSpeedForPower(0, 'normal')).toBe(PHYSICS.minimumShotSpeed)
    expect(shotSpeedForPower(25, 'normal')).toBeGreaterThan(0.9)
    expect(shotSpeedForPower(50, 'normal')).toBeGreaterThan(2.3)
    expect(shotSpeedForPower(100, 'normal')).toBe(PHYSICS.maximumShotSpeed)
    expect(shotSpeedForPower(100, 'punch')).toBeGreaterThan(PHYSICS.maximumShotSpeed)
  })

  it('limits the strike point to the chalked-tip range and applies side-spin squirt', () => {
    const cue = createInitialBalls('three-cushion')[0]
    const spec = getTableSpec('three-cushion')
    applyShot(cue, 'three-cushion', 0, 100, { x: 1, y: 0 }, 'normal')

    expect(cue.velocity.y).toBeLessThan(0)
    expect(Math.hypot(cue.velocity.x, cue.velocity.y)).toBeCloseTo(PHYSICS.maximumShotSpeed, 6)
    expect(Math.abs(cue.angularVelocity.y)).toBeCloseTo(
      PHYSICS.maximumTipOffset * PHYSICS.maximumShotSpeed / (spec.ballDiameter / 2) * 1.55,
      6,
    )
  })

  it('transfers almost all head-on momentum at the measured 0.98 restitution', () => {
    const balls = createInitialBalls('three-cushion').slice(0, 2)
    const spec = getTableSpec('three-cushion')
    const radius = spec.ballDiameter / 2
    balls[0].position = { x: 0, y: 0 }
    balls[1].position = { x: spec.ballDiameter + 0.003, y: 0 }
    balls[0].velocity = { x: 1, y: 0 }
    balls[0].angularVelocity = { x: 0, y: 0, z: -1 / radius }
    balls[1].velocity = { x: 0, y: 0 }
    balls[1].angularVelocity = { x: 0, y: 0, z: 0 }
    const events: ShotEvent[] = []

    stepPhysics(balls, 'three-cushion', 1 / 240, (event) => events.push(event))

    expect(balls[0].velocity.x).toBeLessThan(0.03)
    expect(balls[1].velocity.x).toBeGreaterThan(0.97)
    expect(events).toContainEqual({ type: 'ball', target: 'yellow' })
  })

  it('reflects from a cushion and records the rail contact once', () => {
    const cue = createInitialBalls('three-cushion')[0]
    const spec = getTableSpec('three-cushion')
    const radius = spec.ballDiameter / 2
    cue.position = { x: spec.playingLength / 2 - radius - 0.001, y: 0 }
    cue.velocity = { x: 1, y: 0 }
    cue.angularVelocity = { x: 0, y: 0, z: -1 / radius }
    const events: ShotEvent[] = []

    stepPhysics([cue], 'three-cushion', 1 / 120, (event) => events.push(event))

    expect(cue.velocity.x).toBeLessThan(-0.83)
    expect(cue.velocity.x).toBeGreaterThan(-0.86)
    expect(events).toEqual([{ type: 'cushion', rail: 'right' }])
  })

  it('settles a regulation-table shot without residual numerical motion', () => {
    const balls = createInitialBalls('three-cushion')
    applyShot(balls[0], 'three-cushion', 0, 50, { x: 0, y: 0 }, 'normal')

    let steps = 0
    while (steps < 45 * 240 && Math.hypot(balls[0].velocity.x, balls[0].velocity.y) > 0) {
      stepPhysics(balls, 'three-cushion', 1 / 240, () => undefined)
      steps += 1
    }

    expect(steps).toBeLessThan(45 * 240)
    expect(balls[0].velocity).toEqual({ x: 0, y: 0 })
  })

  it('does not leave an unrealistic stationary ball spinning in place', () => {
    const cue = createInitialBalls('three-cushion')[0]
    cue.velocity = { x: 0.005, y: 0 }
    cue.angularVelocity = { x: 0, y: 8, z: 0 }

    stepPhysics([cue], 'three-cushion', 1 / 120, () => undefined)

    expect(cue.velocity).toEqual({ x: 0, y: 0 })
    expect(cue.angularVelocity).toEqual({ x: 0, y: 0, z: 0 })
  })
})
