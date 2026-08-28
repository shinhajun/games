import type { GameCode } from '../types'

export function scoreUnit(game: GameCode) {
  return game === 'yacht' ? ' PTS' : ' 점'
}
