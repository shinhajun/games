import { describe, expect, it } from 'vitest'
import { resolveCushionImpact } from './cushion'
import { applyShot, createInitialBalls, getTableSpec, PHYSICS, type BallState, type Vec2 } from './engine'

const parameters = {
  energeticRestitution: PHYSICS.cushionEnergeticRestitution,
  cushionFriction: PHYSICS.cushionFriction,
}

function rollingImpact(incidentAngleDegrees: number, topSpinRatio = 1, sideSpinRatio = 0) {
  const spec = getTableSpec('three-cushion')
  const radius = spec.ballDiameter / 2
  const angle = incidentAngleDegrees * Math.PI / 180
  const velocity = { x: Math.cos(angle), y: Math.sin(angle) }
  const ball: BallState = {
    id: 'cue',
    position: { x: 0, y: 0 },
    velocity,
    angularVelocity: {
      x: velocity.y / radius * topSpinRatio,
      y: sideSpinRatio / radius,
      z: -velocity.x / radius * topSpinRatio,
    },
    color: '#fff',
  }
  resolveCushionImpact(ball, spec, { x: 1, y: 0 }, parameters)
  return ball
}

function reboundAngle(ball: BallState) {
  return Math.atan2(ball.velocity.y, -ball.velocity.x) * 180 / Math.PI
}

function rotateQuarter(vector: Vec2): Vec2 {
  return { x: -vector.y, y: vector.x }
}

describe('Mathavan 3D cushion impact', () => {
  it('shortens the geometric 45-degree rebound for a naturally rolling ball', () => {
    const ball = rollingImpact(45)
    expect(reboundAngle(ball)).toBeGreaterThan(36)
    expect(reboundAngle(ball)).toBeLessThan(42)
  })

  it('opens and closes the cushion angle with running and reverse side spin', () => {
    const reverse = reboundAngle(rollingImpact(45, 1, -1))
    const centre = reboundAngle(rollingImpact(45, 1, 0))
    const running = reboundAngle(rollingImpact(45, 1, 1))

    expect(reverse).toBeLessThan(centre)
    expect(running).toBeGreaterThan(centre)
    expect(running - reverse).toBeGreaterThan(8)
  })

  it('includes top and back spin in rebound speed and angle', () => {
    const stun = rollingImpact(45, 0)
    const natural = rollingImpact(45, 1)
    const follow = rollingImpact(45, 2)

    expect(reboundAngle(stun)).toBeLessThan(reboundAngle(natural))
    expect(reboundAngle(follow)).toBeGreaterThan(reboundAngle(natural))
    expect(Math.hypot(follow.velocity.x, follow.velocity.y)).toBeGreaterThan(Math.hypot(stun.velocity.x, stun.velocity.y))
  })

  it('is invariant when the shot, spin, and cushion are rotated together', () => {
    const spec = getTableSpec('three-cushion')
    const base = rollingImpact(35, 1.4, 0.65)
    const angle = 35 * Math.PI / 180
    const radius = spec.ballDiameter / 2
    const velocity = { x: Math.cos(angle), y: Math.sin(angle) }
    const horizontalSpin = { x: velocity.y / radius * 1.4, y: -velocity.x / radius * 1.4 }
    const rotatedVelocity = rotateQuarter(velocity)
    const rotatedSpin = rotateQuarter(horizontalSpin)
    const rotated: BallState = {
      id: 'cue',
      position: { x: 0, y: 0 },
      velocity: rotatedVelocity,
      angularVelocity: { x: rotatedSpin.x, y: 0.65 / radius, z: rotatedSpin.y },
      color: '#fff',
    }

    resolveCushionImpact(rotated, spec, { x: 0, y: 1 }, parameters)
    const expectedVelocity = rotateQuarter(base.velocity)
    const expectedSpin = rotateQuarter({ x: base.angularVelocity.x, y: base.angularVelocity.z })

    expect(rotated.velocity.x).toBeCloseTo(expectedVelocity.x, 8)
    expect(rotated.velocity.y).toBeCloseTo(expectedVelocity.y, 8)
    expect(rotated.angularVelocity.x).toBeCloseTo(expectedSpin.x, 8)
    expect(rotated.angularVelocity.z).toBeCloseTo(expectedSpin.y, 8)
    expect(rotated.angularVelocity.y).toBeCloseTo(base.angularVelocity.y, 8)
  })
})

describe('cue-relative spin axes', () => {
  it('keeps right english and top spin relative to the shot direction', () => {
    const east = createInitialBalls('three-cushion')[0]
    const north = createInitialBalls('three-cushion')[0]
    applyShot(east, 'three-cushion', 0, 60, { x: 0.5, y: 0.5 }, 'normal')
    applyShot(north, 'three-cushion', Math.PI / 2, 60, { x: 0.5, y: 0.5 }, 'normal')

    expect(east.angularVelocity.y).toBeGreaterThan(0)
    expect(north.angularVelocity.y).toBeCloseTo(east.angularVelocity.y, 8)
    expect(east.angularVelocity.z).toBeLessThan(0)
    expect(north.angularVelocity.x).toBeGreaterThan(0)
    expect(east.velocity.y).toBeLessThan(0)
    expect(north.velocity.x).toBeGreaterThan(0)
  })
})
