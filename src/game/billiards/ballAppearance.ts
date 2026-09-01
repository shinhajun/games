import type { BallId } from './engine'

export interface BallSpotDirection {
  axis: 'x' | 'y' | 'z'
  sign: -1 | 1
  position: [number, number, number]
  rotation: [number, number, number]
}

// The six Pro-Cup reference spots sit on three opposite axis pairs. Keeping
// them as children of the ball mesh makes the markings expose the simulated
// roll, side spin, follow, and draw instead of behaving like screen decals.
export const BALL_SPOT_DIRECTIONS: BallSpotDirection[] = [
  { axis: 'x', sign: 1, position: [1, 0, 0], rotation: [0, Math.PI / 2, 0] },
  { axis: 'x', sign: -1, position: [-1, 0, 0], rotation: [0, -Math.PI / 2, 0] },
  { axis: 'y', sign: 1, position: [0, 1, 0], rotation: [-Math.PI / 2, 0, 0] },
  { axis: 'y', sign: -1, position: [0, -1, 0], rotation: [Math.PI / 2, 0, 0] },
  { axis: 'z', sign: 1, position: [0, 0, 1], rotation: [0, 0, 0] },
  { axis: 'z', sign: -1, position: [0, 0, -1], rotation: [0, Math.PI, 0] },
]

export function ballSpotColor(id: BallId) {
  return id === 'red' || id === 'red2' ? '#f7f0dc' : '#c83a34'
}
