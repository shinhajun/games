import { describe, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import { quaternionForTopFace, readTopFace, topFaceFromQuaternion } from './dicePhysics'

describe('physical Yacht die result', () => {
  it('reads the upward face from the simulated quaternion', () => {
    expect(topFaceFromQuaternion(new Quaternion())).toBe(1)
    expect(topFaceFromQuaternion(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2))).toBe(2)
    expect(topFaceFromQuaternion(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2))).toBe(3)
  })

  it('reports whether a physical result is flat or cocked without changing its rotation', () => {
    const flat = new Quaternion()
    const cocked = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 4)
    const before = cocked.clone()

    expect(readTopFace(flat)).toEqual({ value: 1, alignment: 1, separation: 1 })
    expect(readTopFace(cocked).alignment).toBeCloseTo(Math.SQRT1_2, 6)
    expect(readTopFace(cocked).separation).toBeCloseTo(0, 6)
    expect(cocked.equals(before)).toBe(true)
  })

  it('renders every recorded value on the same upward face the scorer reads', () => {
    for (let value = 1; value <= 6; value += 1) {
      expect(topFaceFromQuaternion(quaternionForTopFace(value, value * 0.37))).toBe(value)
    }
  })

})
