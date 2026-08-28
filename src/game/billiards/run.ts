export const BILLIARDS_STARTING_LIVES = 5

export interface BilliardsRunState {
  score: number
  lives: number
}

export interface BilliardsRunResult extends BilliardsRunState {
  finished: boolean
}

export function settleBilliardsShot(state: BilliardsRunState, success: boolean): BilliardsRunResult {
  const score = state.score + (success ? 1 : 0)
  const lives = success ? state.lives : Math.max(0, state.lives - 1)
  return { score, lives, finished: lives === 0 }
}
