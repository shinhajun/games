import { describe, expect, it } from 'vitest'
import {
  canLaunchCuePull,
  cuePullFromKeyboard,
  cuePullFraction,
  DEFAULT_CUE_ELEVATION,
  powerFromCuePull,
  spinForStrokePreset,
} from './controls'

describe('billiards cue pull controls', () => {
  it('starts every table with a level cue', () => {
    expect(DEFAULT_CUE_ELEVATION).toBe(0)
  })

  it('uses a fixed track so touch position never changes power sensitivity', () => {
    expect(cuePullFraction(100, 150, 200)).toBe(0.25)
    expect(cuePullFraction(300, 350, 200)).toBe(0.25)
    expect(cuePullFraction(100, 50, 200)).toBe(0)
    expect(cuePullFraction(100, 350, 200)).toBe(1)
  })

  it('maps half pull to half power and full pull to full power', () => {
    expect(powerFromCuePull(0)).toBe(0)
    expect(powerFromCuePull(0.5)).toBe(50)
    expect(powerFromCuePull(1)).toBe(100)
  })

  it('allows every visible power from 1 while ignoring a stationary tap', () => {
    expect(canLaunchCuePull(0)).toBe(false)
    expect(canLaunchCuePull(0.004)).toBe(false)
    expect(canLaunchCuePull(0.01)).toBe(true)
    expect(powerFromCuePull(0.01)).toBe(1)
    expect(canLaunchCuePull(0.05)).toBe(true)
    expect(canLaunchCuePull(0.09)).toBe(true)
  })

  it('turns stroke choices into honest hit-point presets', () => {
    expect(spinForStrokePreset('push', { x: 0.2, y: -0.1 })).toEqual({ x: 0.2, y: 0.4 })
    expect(spinForStrokePreset('normal', { x: -0.3, y: 0.4 })).toEqual({ x: -0.3, y: 0 })
    expect(spinForStrokePreset('punch', { x: 0.2, y: 0.4 })).toEqual({ x: 0.2, y: -0.28 })

    const clamped = spinForStrokePreset('push', { x: 0.7, y: 0 })
    expect(Math.hypot(clamped.x, clamped.y)).toBeCloseTo(0.7, 12)
  })

  it('supports precise and accelerated keyboard power control', () => {
    expect(cuePullFromKeyboard(0, 'ArrowDown')).toBe(0.01)
    expect(cuePullFromKeyboard(0.5, 'ArrowUp', true)).toBe(0.4)
    expect(cuePullFromKeyboard(0.5, 'ArrowRight', true)).toBe(0.6)
    expect(cuePullFromKeyboard(0.5, 'Home')).toBe(0)
    expect(cuePullFromKeyboard(0.5, 'End')).toBe(1)
    expect(cuePullFromKeyboard(0.5, 'Enter')).toBeNull()
  })
})
