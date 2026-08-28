import { describe, expect, it } from 'vitest'
import { cuePullFraction, powerFromCuePull } from './controls'

describe('billiards cue pull controls', () => {
  it('uses the full remaining rail travel instead of a fixed 150px cap', () => {
    expect(cuePullFraction(100, 291, 500)).toBeCloseTo(0.5, 2)
    expect(cuePullFraction(100, 482, 500)).toBe(1)
  })

  it('maps half pull to half power and full pull to full power', () => {
    expect(powerFromCuePull(0)).toBe(0)
    expect(powerFromCuePull(0.5)).toBe(50)
    expect(powerFromCuePull(1)).toBe(100)
  })
})
