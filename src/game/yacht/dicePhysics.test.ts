import { describe, expect, it } from 'vitest'
import { Euler, Quaternion, Vector3 } from 'three'
import { dieHalfExtents, quaternionForTopFace, topFaceFromQuaternion, uprightQuaternionForTopFace } from './dicePhysics'

describe('physical Yacht die result', () => {
  it('reads the upward face from the simulated quaternion', () => {
    expect(topFaceFromQuaternion(new Quaternion())).toBe(1)
    expect(topFaceFromQuaternion(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2))).toBe(2)
    expect(topFaceFromQuaternion(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2))).toBe(3)
  })

  it('renders every recorded value on the same upward face the scorer reads', () => {
    for (let value = 1; value <= 6; value += 1) {
      expect(topFaceFromQuaternion(quaternionForTopFace(value, value * 0.37))).toBe(value)
    }
  })

  it('snaps the physically selected face upright without changing its value', () => {
    const simulated = new Quaternion()
      .setFromEuler(new Euler(1.41, 0.72, -0.18, 'XYZ'))
      .normalize()
    const result = topFaceFromQuaternion(simulated)
    const upright = uprightQuaternionForTopFace(simulated)

    expect(topFaceFromQuaternion(upright)).toBe(result)
    expect(upright.length()).toBeCloseTo(1, 6)
  })

  it('raises a tumbling die by its oriented half extent so no corner enters the felt', () => {
    const flat = dieHalfExtents(new Quaternion())
    const tilted = dieHalfExtents(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 4))

    expect(flat.y).toBeCloseTo(0.5, 6)
    expect(tilted.y).toBeCloseTo(Math.SQRT1_2, 6)
  })
})
