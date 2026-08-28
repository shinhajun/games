import { createClient } from '@supabase/supabase-js'
import type { GameCode, LeaderboardEntry, PlayerProfile, ScoreSubmission } from '../types'

const LOCAL_KEY = 'hajun-arcade:scores:v1'
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isCloudConnected = Boolean(supabaseUrl && supabaseKey)
const supabase = isCloudConnected ? createClient(supabaseUrl!, supabaseKey!) : null
let cloudIdentityPromise: Promise<boolean> | null = null

function readLocal(): LeaderboardEntry[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '[]') as LeaderboardEntry[]
  } catch {
    return []
  }
}

function writeLocal(entries: LeaderboardEntry[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(entries))
}

function mapRow(row: Record<string, unknown>): LeaderboardEntry {
  return {
    playerId: String(row.player_key),
    name: String(row.display_name),
    game: row.game as GameCode,
    score: Number(row.best_score),
    durationMs: Number(row.best_duration_ms),
    playedCount: Number(row.played_count),
    updatedAt: String(row.updated_at),
  }
}

export async function getLeaderboard(game: GameCode, limit = 20): Promise<LeaderboardEntry[]> {
  if (supabase) {
    const { data, error } = await supabase.rpc('get_arcade_leaderboard', {
      p_game: game,
      p_limit: limit,
    })
    if (!error && data) return data.map((row: Record<string, unknown>) => mapRow(row))
  }

  return readLocal()
    .filter((entry) => entry.game === game)
    .sort((a, b) => b.score - a.score || a.durationMs - b.durationMs)
    .slice(0, limit)
}

export async function prepareCloudLeaderboard(): Promise<boolean> {
  if (!supabase) return false
  if (cloudIdentityPromise) return cloudIdentityPromise
  cloudIdentityPromise = (async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    if (sessionData.session?.user) return true
    const { data, error } = await supabase.auth.signInAnonymously()
    if (error) throw error
    return Boolean(data.user)
  })().catch((error: unknown) => {
    cloudIdentityPromise = null
    throw error
  })
  return cloudIdentityPromise
}

export async function startScoreRun(game: GameCode): Promise<string | null> {
  if (!supabase) return null
  if (!await prepareCloudLeaderboard()) return null
  const { data, error } = await supabase.rpc('start_arcade_run', {
    p_game: game,
  })
  if (error) {
    cloudIdentityPromise = null
    throw error
  }
  return typeof data === 'string' ? data : null
}

export async function submitScore(profile: PlayerProfile, run: ScoreSubmission, runId: string | null = null) {
  const now = new Date().toISOString()
  const entries = readLocal()
  const existing = entries.find((entry) => entry.playerId === profile.id && entry.game === run.game)
  const isBetter = !existing || run.score > existing.score || (run.score === existing.score && run.durationMs < existing.durationMs)
  const next: LeaderboardEntry = {
    playerId: profile.id,
    name: profile.name,
    game: run.game,
    score: isBetter ? run.score : existing.score,
    durationMs: isBetter ? run.durationMs : existing.durationMs,
    playedCount: (existing?.playedCount ?? 0) + 1,
    updatedAt: now,
  }
  writeLocal([...entries.filter((entry) => !(entry.playerId === profile.id && entry.game === run.game)), next])

  if (supabase) {
    if (!runId) throw new Error('cloud score run was not started')
    const { error } = await supabase.rpc('submit_arcade_score', {
      p_display_name: profile.name,
      p_game: run.game,
      p_score: run.score,
      p_duration_ms: Math.max(0, Math.round(run.durationMs)),
      p_run_id: runId,
    })
    if (error) throw error
  }
  return next
}
