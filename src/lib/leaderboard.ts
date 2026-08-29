import { createClient } from '@supabase/supabase-js'
import type { GameCode, LeaderboardEntry, PlayerProfile, ScoreSubmission } from '../types'

const LEGACY_LOCAL_SCORE_KEY = 'hajun-arcade:scores:v1'
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const projectRef = supabaseUrl ? new URL(supabaseUrl).hostname.split('.')[0] : null
const authStorageKey = projectRef ? `sb-${projectRef}-auth-token` : null
const CLOUD_REQUEST_TIMEOUT_MS = 2_000

async function fetchWithDeadline(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController()
  const upstreamSignal = init?.signal
  const abortFromUpstream = () => controller.abort(upstreamSignal?.reason)
  if (upstreamSignal?.aborted) abortFromUpstream()
  else upstreamSignal?.addEventListener('abort', abortFromUpstream, { once: true })
  const timeout = globalThis.setTimeout(() => controller.abort(new DOMException('Arcade cloud request timed out', 'TimeoutError')), CLOUD_REQUEST_TIMEOUT_MS)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    globalThis.clearTimeout(timeout)
    upstreamSignal?.removeEventListener('abort', abortFromUpstream)
  }
}

const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, {
      ...(authStorageKey ? { auth: { storageKey: authStorageKey } } : {}),
      global: { fetch: fetchWithDeadline },
    })
  : null
let cloudIdentityPromise: Promise<boolean> | null = null

class ScoreSubmissionError extends Error {
  status: number

  constructor(error: unknown, status: number) {
    const message = error instanceof Error
      ? error.message
      : typeof error === 'object' && error && 'message' in error
        ? String(error.message)
        : 'Score submission failed'
    super(message)
    this.name = 'ScoreSubmissionError'
    this.status = status
  }
}

if (typeof localStorage !== 'undefined') localStorage.removeItem(LEGACY_LOCAL_SCORE_KEY)

function requireCloudClient() {
  if (!supabase) throw new Error('Supabase leaderboard is not configured')
  return supabase
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

function replaceableSessionError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { name?: string; status?: number }
  return candidate.name === 'AuthSessionMissingError'
    || candidate.status === 400
    || candidate.status === 401
    || candidate.status === 403
    || candidate.status === 422
}

function clearStoredIdentity() {
  if (authStorageKey && typeof localStorage !== 'undefined') localStorage.removeItem(authStorageKey)
}

export async function prepareCloudLeaderboard(): Promise<boolean> {
  const client = requireCloudClient()
  if (cloudIdentityPromise) return cloudIdentityPromise
  cloudIdentityPromise = (async () => {
    // getUser validates the persisted JWT with Auth. getSession alone trusts
    // browser storage and can mistake a stale or corrupted token for a user.
    const { data: userData, error: userError } = await client.auth.getUser()
    if (!userError && userData.user) return true
    if (userError && !replaceableSessionError(userError)) throw userError

    if ((userError as { name?: string } | null)?.name !== 'AuthSessionMissingError') {
      await client.auth.signOut({ scope: 'local' }).catch(() => undefined)
    }
    clearStoredIdentity()

    const { data, error } = await client.auth.signInAnonymously()
    if (error) throw error
    if (!data.user) throw new Error('Supabase anonymous sign-in returned no user')
    return true
  })().catch((error: unknown) => {
    cloudIdentityPromise = null
    throw error
  })
  return cloudIdentityPromise
}

export async function getLeaderboard(game: GameCode, limit = 20): Promise<LeaderboardEntry[]> {
  const client = requireCloudClient()
  await prepareCloudLeaderboard()
  const { data, error, status } = await client.rpc('get_arcade_leaderboard', {
    p_game: game,
    p_limit: limit,
  })
  if (error) {
    if (status === 401 || status === 403) cloudIdentityPromise = null
    throw error
  }
  return (data ?? []).map((row: Record<string, unknown>) => mapRow(row))
}

export async function startScoreRun(game: GameCode): Promise<string> {
  const client = requireCloudClient()
  await prepareCloudLeaderboard()
  const { data, error, status } = await client.rpc('start_arcade_run', {
    p_game: game,
  })
  if (error) {
    if (status === 401 || status === 403) cloudIdentityPromise = null
    throw error
  }
  if (typeof data !== 'string') throw new Error('Supabase did not return a score run id')
  return data
}

export async function submitScore(profile: PlayerProfile, run: ScoreSubmission, runId: string) {
  const client = requireCloudClient()
  await prepareCloudLeaderboard()
  let response
  try {
    response = await client.rpc('submit_arcade_score', {
      p_display_name: profile.name,
      p_game: run.game,
      p_score: run.score,
      p_duration_ms: Math.max(0, Math.round(run.durationMs)),
      p_run_id: runId,
    })
  } catch (error) {
    throw new ScoreSubmissionError(error, 0)
  }
  const { error, status = 0 } = response
  if (error) {
    if (status === 401 || status === 403) cloudIdentityPromise = null
    throw new ScoreSubmissionError(error, status)
  }
}

function shouldRetrySameRun(error: unknown) {
  return error instanceof ScoreSubmissionError
    && (error.status === 0 || error.status === 408 || error.status >= 500)
}

function shouldRotateRun(error: unknown) {
  if (!(error instanceof ScoreSubmissionError)) return false
  if ([401, 403, 404, 409, 422].includes(error.status)) return true
  return error.status === 400 && /(?:invalid|consumed) run/i.test(error.message)
}

async function submitScoreWithRetry(profile: PlayerProfile, run: ScoreSubmission, runId: string) {
  try {
    await submitScore(profile, run, runId)
  } catch (error) {
    if (!shouldRetrySameRun(error)) throw error
    // A lost response can leave a successfully consumed token looking failed
    // to the browser. The server treats an identical retry as idempotent.
    await submitScore(profile, run, runId)
  }
}

export async function saveScore(
  profile: PlayerProfile,
  run: ScoreSubmission,
  existingRun?: Promise<string> | null,
): Promise<string> {
  let runId: string | null = null
  if (existingRun) {
    try {
      runId = await existingRun
    } catch {
      runId = null
    }
  }

  if (runId) {
    try {
      await submitScoreWithRetry(profile, run, runId)
      return runId
    } catch (error) {
      if (!shouldRotateRun(error)) throw error
      // The original token may never have reached the browser, may belong to
      // an expired auth session, or may already be consumed. Rotate once.
    }
  }

  const replacementRunId = await startScoreRun(run.game)
  await submitScoreWithRetry(profile, run, replacementRunId)
  return replacementRunId
}
