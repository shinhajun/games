export type GameCode = 'three-cushion' | 'four-ball' | 'yacht'

export interface PlayerProfile {
  id: string
  name: string
}

export interface LeaderboardEntry {
  playerId: string
  name: string
  game: GameCode
  score: number
  durationMs: number
  playedCount: number
  updatedAt: string
}

export interface ScoreSubmission {
  game: GameCode
  score: number
  durationMs: number
}

export const GAME_META: Record<GameCode, { label: string; eyebrow: string; maxScore: number }> = {
  'three-cushion': { label: '3쿠션', eyebrow: 'THREE CUSHION', maxScore: 6 },
  'four-ball': { label: '4구', eyebrow: 'FOUR BALL', maxScore: 6 },
  yacht: { label: 'Yacht Dice', eyebrow: 'YACHT DICE', maxScore: 297 },
}
