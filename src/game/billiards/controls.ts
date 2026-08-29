import { PHYSICS, type StrokeStyle, type Vec2 } from './engine'

export const DEFAULT_CUE_ELEVATION = 0

const STROKE_PRESET_Y: Record<StrokeStyle, number> = {
  push: 0.4,
  normal: 0,
  punch: -0.28,
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

/**
 * Maps downward drag distance to the fixed power track. The same physical
 * movement always produces the same power, regardless of touch position.
 */
export function cuePullFraction(gestureStartY: number, currentY: number, maximumTravel: number) {
  return clamp01((currentY - gestureStartY) / Math.max(1, maximumTravel))
}

export function powerFromCuePull(pull: number) {
  return Math.round(clamp01(pull) * 100)
}

export function canLaunchCuePull(pull: number) {
  return powerFromCuePull(pull) > 0
}

export function cuePullFromKeyboard(current: number, key: string, accelerated = false) {
  if (key === 'Home') return 0
  if (key === 'End') return 1
  const direction = key === 'ArrowDown' || key === 'ArrowRight'
    ? 1
    : key === 'ArrowUp' || key === 'ArrowLeft'
      ? -1
      : 0
  if (direction === 0) return null
  const step = accelerated ? 0.1 : 0.01
  return Math.round(clamp01(current + direction * step) * 100) / 100
}

export function spinForStrokePreset(stroke: StrokeStyle, current: Vec2): Vec2 {
  const y = STROKE_PRESET_Y[stroke]
  const maximumSide = Math.sqrt(Math.max(0, PHYSICS.maximumTipOffset ** 2 - y ** 2))
  return {
    x: Math.max(-maximumSide, Math.min(maximumSide, current.x)),
    y,
  }
}
