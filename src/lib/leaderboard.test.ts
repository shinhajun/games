import { afterEach, describe, expect, it, vi } from 'vitest'

function createStorage() {
  const values = new Map<string, string>()
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
    clear: vi.fn(() => values.clear()),
    key: vi.fn((index: number) => [...values.keys()][index] ?? null),
    get length() { return values.size },
  }
}

async function loadLeaderboard(client: object) {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', 'https://project-ref.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
  vi.doMock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => client) }))
  return import('./leaderboard')
}

afterEach(() => {
  vi.doUnmock('@supabase/supabase-js')
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Supabase leaderboard connection', () => {
  it('replaces a stale stored session with a new anonymous identity', async () => {
    const storage = createStorage()
    vi.stubGlobal('localStorage', storage)
    const getUser = vi.fn().mockResolvedValue({ data: { user: null }, error: { name: 'AuthApiError', status: 401 } })
    const signOut = vi.fn().mockResolvedValue({ error: null })
    const signInAnonymously = vi.fn().mockResolvedValue({ data: { user: { id: 'fresh-user' } }, error: null })
    const { prepareCloudLeaderboard } = await loadLeaderboard({
      auth: { getUser, signOut, signInAnonymously },
    })

    await expect(prepareCloudLeaderboard()).resolves.toBe(true)
    expect(getUser).toHaveBeenCalledOnce()
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(storage.removeItem).toHaveBeenCalledWith('sb-project-ref-auth-token')
    expect(signInAnonymously).toHaveBeenCalledOnce()
  })

  it('rejects a failed leaderboard RPC instead of returning browser scores', async () => {
    vi.stubGlobal('localStorage', createStorage())
    const rpcError = { name: 'PostgrestError', status: 503 }
    const rpc = vi.fn().mockResolvedValue({ data: null, error: rpcError, status: 503 })
    const { getLeaderboard } = await loadLeaderboard({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'valid-user' } }, error: null }),
      },
      rpc,
    })

    await expect(getLeaderboard('three-cushion')).rejects.toBe(rpcError)
    expect(rpc).toHaveBeenCalledWith('get_arcade_leaderboard', { p_game: 'three-cushion', p_limit: 20 })
  })

  it('creates a replacement run when the original run never became available', async () => {
    vi.stubGlobal('localStorage', createStorage())
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: 'replacement-run', error: null, status: 200 })
      .mockResolvedValueOnce({ data: null, error: null, status: 204 })
    const { saveScore } = await loadLeaderboard({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'valid-user' } }, error: null }),
      },
      rpc,
    })
    const profile = { id: 'browser-profile', name: '저장검증' }
    const submission = { game: 'yacht' as const, score: 120, durationMs: 18_500 }

    await expect(saveScore(profile, submission, Promise.reject(new Error('start failed'))))
      .resolves.toBe('replacement-run')
    expect(rpc).toHaveBeenNthCalledWith(1, 'start_arcade_run', { p_game: 'yacht' })
    expect(rpc).toHaveBeenNthCalledWith(2, 'submit_arcade_score', {
      p_display_name: '저장검증',
      p_game: 'yacht',
      p_score: 120,
      p_duration_ms: 18_500,
      p_run_id: 'replacement-run',
    })
  })

  it('retries the same token, then rotates it when submission keeps failing', async () => {
    vi.stubGlobal('localStorage', createStorage())
    const consumedError = { name: 'PostgrestError', status: 400, message: 'invalid or consumed run' }
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: null, error: consumedError, status: 400 })
      .mockResolvedValueOnce({ data: null, error: consumedError, status: 400 })
      .mockResolvedValueOnce({ data: 'fresh-run', error: null, status: 200 })
      .mockResolvedValueOnce({ data: null, error: null, status: 204 })
    const { saveScore } = await loadLeaderboard({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'valid-user' } }, error: null }),
      },
      rpc,
    })
    const profile = { id: 'browser-profile', name: '재시도검증' }
    const submission = { game: 'four-ball' as const, score: 17, durationMs: 24_000 }

    await expect(saveScore(profile, submission, Promise.resolve('old-run'))).resolves.toBe('fresh-run')
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'submit_arcade_score',
      'submit_arcade_score',
      'start_arcade_run',
      'submit_arcade_score',
    ])
  })
})
