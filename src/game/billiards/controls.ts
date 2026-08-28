function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

/**
 * Maps a downward cue gesture to the fraction of the remaining control travel.
 * This keeps half of the visible travel at 50%, regardless of screen height.
 */
export function cuePullFraction(startY: number, currentY: number, controlBottom: number, bottomPadding = 18) {
  const availableTravel = Math.max(1, controlBottom - bottomPadding - startY)
  return clamp01((currentY - startY) / availableTravel)
}

export function powerFromCuePull(pull: number) {
  return Math.round(clamp01(pull) * 100)
}
