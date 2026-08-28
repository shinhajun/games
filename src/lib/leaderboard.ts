import { createClient } from '@supabase/supabase-js'
import type { GameCode, LeaderboardEntry, PlayerProfile, ScoreSubmission } from '../types'

const LOCAL_KEY = 'hajun-arcade:scores:v1'
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isCloudConnected = Boolean(supabaseUrl && supabaseKey)
const supabase = isCloudConnected ? createClient(supabaseUrl!, supabaseKey!) : null

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
    playerId: String(row.device_id),
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
    const { data, error } = await supabase
      .from('leaderboard_scores')
      .select('device_id, display_name, game, best_score, best_duration_ms, played_count, updated_at')
      .eq('game', game)
      .order('best_score', { ascending: false })
      .order('best_duration_ms', { ascending: true })
      .limit(limit)
    if (!error && data) return data.map((row) => mapRow(row as Record<string, unknown>))
  }

  return readLocal()
    .filter((entry) => entry.game === game)
    .sort((a, b) => b.score - a.score || a.durationMs - b.durationMs)
    .slice(0, limit)
}

export async function submitScore(profile: PlayerProfile, run: ScoreSubmission) {
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
    const { error } = await supabase.rpc('submit_arcade_score', {
      p_device_id: profile.id,
      p_display_name: profile.name,
      p_game: run.game,
      p_score: run.score,
      p_duration_ms: Math.max(0, Math.round(run.durationMs)),
    })
    if (error) throw error
  }
  return next
}
