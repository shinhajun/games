import { describe, expect, it } from 'vitest'
import {
  applyShot,
  createInitialBalls,
  cueContactGeometry,
  evaluateShot,
  getTableSpec,
  PHYSICS,
  shotKinematics,
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

  it('requires the far red as the direct first contact on each opening shot', () => {
    expect(evaluateShot('three-cushion', [
      { type: 'ball', target: 'red' }, cushion(), cushion(), cushion(), { type: 'ball', target: 'yellow' },
    ], { openingShot: true }).success).toBe(true)
    expect(evaluateShot('three-cushion', [
      { type: 'ball', target: 'yellow' }, cushion(), cushion(), cushion(), { type: 'ball', target: 'red' },
    ], { openingShot: true })).toMatchObject({ success: false, title: '초구 순서 위반' })
    expect(evaluateShot('four-ball', [
      { type: 'ball', target: 'red2' }, { type: 'ball', target: 'red' },
    ], { openingShot: true })).toMatchObject({ success: false, title: '초구 순서 위반' })
    expect(evaluateShot('four-ball', [
      { type: 'ball', target: 'red' }, { type: 'ball', target: 'red2' },
    ], { openingShot: true }).success).toBe(true)
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

  it('uses the UMB opening spots for three-cushion', () => {
    const spec = getTableSpec('three-cushion')
    const [cue, yellow, red] = createInitialBalls('three-cushion')

    expect(cue.position).toEqual({ x: -spec.playingLength / 4, y: -0.1825 })
    expect(yellow.position).toEqual({ x: -spec.playingLength / 4, y: 0 })
    expect(red.position).toEqual({ x: spec.playingLength / 4, y: 0 })
  })

  it('uses the Korean four-ball opening line with the cue beside the near red', () => {
    const spec = getTableSpec('four-ball')
    const [cue, yellow, red, red2] = createInitialBalls('four-ball')

    expect(cue.position).toEqual({ x: -spec.playingLength / 4, y: -0.16 })
    expect(red2.position).toEqual({ x: -spec.playingLength / 4, y: 0 })
    expect(red.position).toEqual({ x: spec.playingLength / 4, y: 0 })
    expect(yellow.position).toEqual({ x: spec.playingLength * 3 / 8, y: 0 })
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
    const kinematics = shotKinematics('three-cushion', 0, 100, { x: 1, y: 0 }, 'normal')
    applyShot(cue, 'three-cushion', 0, 100, { x: 1, y: 0 }, 'normal')

    expect(cue.velocity.y).toBeLessThan(0)
    expect(Math.abs(kinematics.launchAngle) * 180 / Math.PI).toBeLessThanOrEqual(0.7)
    expect(Math.hypot(cue.velocity.x, cue.velocity.y)).toBeCloseTo(PHYSICS.maximumShotSpeed, 6)
    expect(Math.abs(cue.angularVelocity.y)).toBeCloseTo(
      PHYSICS.maximumTipOffset * PHYSICS.maximumShotSpeed / (spec.ballDiameter / 2) * 2.5,
      6,
    )
  })

  it('keeps player-right english physically signed through launch and a head-on cushion', () => {
    const spec = getTableSpec('three-cushion')
    const rightEnglish = createInitialBalls('three-cushion')[0]
    const leftEnglish = createInitialBalls('three-cushion')[0]

    applyShot(rightEnglish, 'three-cushion', 0, 60, { x: 0.5, y: 0 }, 'normal')
    applyShot(leftEnglish, 'three-cushion', 0, 60, { x: -0.5, y: 0 }, 'normal')

    expect(rightEnglish.angularVelocity.y).toBeGreaterThan(0)
    expect(leftEnglish.angularVelocity.y).toBeLessThan(0)
    expect(rightEnglish.velocity.y).toBeLessThan(0)
    expect(leftEnglish.velocity.y).toBeGreaterThan(0)

    rightEnglish.position = { x: spec.playingLength / 2 - spec.ballDiameter / 2 - 0.001, y: 0 }
    leftEnglish.position = { x: spec.playingLength / 2 - spec.ballDiameter / 2 - 0.001, y: 0 }
    rightEnglish.velocity = { x: 1, y: 0 }
    leftEnglish.velocity = { x: 1, y: 0 }

    stepPhysics([rightEnglish], 'three-cushion', 1 / 120, () => undefined)
    stepPhysics([leftEnglish], 'three-cushion', 1 / 120, () => undefined)

    expect(rightEnglish.velocity.x).toBeLessThan(0)
    expect(leftEnglish.velocity.x).toBeLessThan(0)
    expect(rightEnglish.velocity.y).toBeGreaterThan(0)
    expect(leftEnglish.velocity.y).toBeLessThan(0)
  })

  it('keeps the 3D cue contact point on the ball surface at every allowed elevation', () => {
    const geometry = cueContactGeometry(Math.PI / 5, { x: 0.52, y: -0.31 }, 32)
    const length = Math.hypot(geometry.contactNormal.x, geometry.contactNormal.y, geometry.contactNormal.z)
    const cueLength = Math.hypot(geometry.cueDirection.x, geometry.cueDirection.y, geometry.cueDirection.z)

    expect(length).toBeCloseTo(1, 12)
    expect(cueLength).toBeCloseTo(1, 12)
    expect(geometry.cueDirection.y).toBeLessThan(0)
  })

  it('launches a centre hit exactly down the aim line and loses horizontal speed only when the cue is raised', () => {
    const flat = shotKinematics('three-cushion', 0.73, 70, { x: 0, y: 0 }, 'normal', 0)
    const raised = shotKinematics('three-cushion', 0.73, 70, { x: 0, y: 0 }, 'normal', 30)

    expect(flat.launchAngle).toBeCloseTo(0.73, 12)
    expect(Math.atan2(flat.velocity.y, flat.velocity.x)).toBeCloseTo(0.73, 12)
    expect(flat.angularVelocity).toEqual({ x: 0, y: 0, z: 0 })
    expect(Math.hypot(raised.velocity.x, raised.velocity.y)).toBeCloseTo(
      Math.hypot(flat.velocity.x, flat.velocity.y) * Math.cos(Math.PI / 6) ** 2,
      10,
    )
    expect(Math.hypot(raised.impulse.x, raised.impulse.z)).toBeCloseTo(
      getTableSpec('three-cushion').ballMass * Math.hypot(raised.velocity.x, raised.velocity.y),
      12,
    )
    expect(raised.impulse.y).toBeCloseTo(
      -Math.tan(Math.PI / 6) * Math.hypot(raised.impulse.x, raised.impulse.z),
      12,
    )
  })

  it('creates gradual tip-side swerve only when side spin is combined with cue elevation', () => {
    const flat = createInitialBalls('three-cushion')[0]
    const raised = createInitialBalls('three-cushion')[0]
    flat.position = { x: 0, y: 0 }
    raised.position = { x: 0, y: 0 }
    applyShot(flat, 'three-cushion', 0, 55, { x: 0.55, y: 0 }, 'normal', 0)
    applyShot(raised, 'three-cushion', 0, 55, { x: 0.55, y: 0 }, 'normal', 28)
    const flatInitialAngle = Math.atan2(flat.velocity.y, flat.velocity.x)
    const raisedInitialAngle = Math.atan2(raised.velocity.y, raised.velocity.x)

    for (let step = 0; step < 120; step += 1) {
      stepPhysics([flat], 'three-cushion', 1 / 240, () => undefined)
      stepPhysics([raised], 'three-cushion', 1 / 240, () => undefined)
    }

    expect(Math.atan2(flat.velocity.y, flat.velocity.x)).toBeCloseTo(flatInitialAngle, 8)
    expect(Math.atan2(raised.velocity.y, raised.velocity.x)).toBeGreaterThan(raisedInitialAngle)
    expect(raised.angularVelocity.x).toBeGreaterThan(0)
  })

  it('retains useful vertical-axis spin while the ball is still travelling', () => {
    const cue = createInitialBalls('three-cushion')[0]
    cue.position = { x: 0, y: 0 }
    applyShot(cue, 'three-cushion', 0, 20, { x: 0.55, y: 0 }, 'normal', 0)
    const initialSideSpin = cue.angularVelocity.y

    for (let step = 0; step < 0.5 * 240; step += 1) {
      stepPhysics([cue], 'three-cushion', 1 / 240, () => undefined)
    }

    expect(cue.angularVelocity.y).toBeGreaterThan(initialSideSpin * 0.85)
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

    expect(cue.velocity.x).toBeLessThan(-0.96)
    expect(cue.velocity.x).toBeGreaterThan(-0.99)
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

  it('lets stationary side spin decay physically instead of killing it in one frame', () => {
    const cue = createInitialBalls('three-cushion')[0]
    const spec = getTableSpec('three-cushion')
    const radius = spec.ballDiameter / 2
    cue.velocity = { x: 0.005, y: 0 }
    cue.angularVelocity = { x: 0, y: 8, z: 0 }

    stepPhysics([cue], 'three-cushion', 1 / 120, () => undefined)

    expect(cue.velocity).toEqual({ x: 0, y: 0 })
    expect(cue.angularVelocity.x).toBe(0)
    expect(cue.angularVelocity.z).toBe(0)
    expect(cue.angularVelocity.y).toBeCloseTo(
      8 - (2.5 * spec.spinningFriction * PHYSICS.gravity / radius) / 120,
      10,
    )

    for (let step = 0; step < 3 * 240; step += 1) {
      stepPhysics([cue], 'three-cushion', 1 / 240, () => undefined)
    }
    expect(cue.angularVelocity.y).toBe(0)
  })
})
