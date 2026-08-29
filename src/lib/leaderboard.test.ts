import { afterEach, describe, expect, it, vi } from 'vitest'

interface MockClientOptions {
  global?: { fetch?: typeof globalThis.fetch }
}

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
  const createClient = vi.fn((_url: string, _key: string, _options?: MockClientOptions) => client)
  vi.doMock('@supabase/supabase-js', () => ({ createClient }))
  return { ...await import('./leaderboard'), createClient }
}

afterEach(() => {
  vi.useRealTimers()
  vi.doUnmock('@supabase/supabase-js')
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Supabase leaderboard connection', () => {
  it('aborts a cloud request instead of letting it hang for ten seconds', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('localStorage', createStorage())
    const fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
    }))
    vi.stubGlobal('fetch', fetch)
    const { createClient } = await loadLeaderboard({})
    const deadlineFetch = createClient.mock.calls[0]?.[2]?.global?.fetch
    if (!deadlineFetch) throw new Error('Supabase deadline fetch was not configured')

    const request = deadlineFetch('https://project-ref.supabase.co/rest/v1/rpc/submit_arcade_score')
    const assertion = expect(request).rejects.toMatchObject({ name: 'TimeoutError' })
    await vi.advanceTimersByTimeAsync(2_001)
    await assertion
    expect(fetch).toHaveBeenCalledOnce()
  })

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

  it('rotates immediately when the server rejects an invalid or consumed run', async () => {
    vi.stubGlobal('localStorage', createStorage())
    const consumedError = { name: 'PostgrestError', status: 400, message: 'invalid or consumed run' }
    const rpc = vi.fn()
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
      'start_arcade_run',
      'submit_arcade_score',
    ])
  })

  it('retries an ambiguous server failure once without starting another run', async () => {
    vi.stubGlobal('localStorage', createStorage())
    const serverError = { name: 'PostgrestError', status: 503, message: 'temporarily unavailable' }
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: null, error: serverError, status: 503 })
      .mockResolvedValueOnce({ data: null, error: null, status: 204 })
    const { saveScore } = await loadLeaderboard({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'valid-user' } }, error: null }),
      },
      rpc,
    })
    const profile = { id: 'browser-profile', name: '재시도검증' }
    const submission = { game: 'yacht' as const, score: 140, durationMs: 30_000 }

    await expect(saveScore(profile, submission, Promise.resolve('active-run'))).resolves.toBe('active-run')
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'submit_arcade_score',
      'submit_arcade_score',
    ])
  })

  it('does not rotate a run for a deterministic validation failure', async () => {
    vi.stubGlobal('localStorage', createStorage())
    const validationError = { name: 'PostgrestError', status: 400, message: 'invalid score' }
    const rpc = vi.fn().mockResolvedValueOnce({ data: null, error: validationError, status: 400 })
    const { saveScore } = await loadLeaderboard({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'valid-user' } }, error: null }),
      },
      rpc,
    })
    const profile = { id: 'browser-profile', name: '검증실패' }
    const submission = { game: 'yacht' as const, score: 999, durationMs: 30_000 }

    await expect(saveScore(profile, submission, Promise.resolve('active-run'))).rejects.toThrow('invalid score')
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(['submit_arcade_score'])
  })

  it('stops after two ambiguous failures instead of adding a replacement-run waterfall', async () => {
    vi.stubGlobal('localStorage', createStorage())
    const networkError = { name: 'FetchError', status: 0, message: 'network timeout' }
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: null, error: networkError, status: 0 })
      .mockResolvedValueOnce({ data: null, error: networkError, status: 0 })
    const { saveScore } = await loadLeaderboard({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'valid-user' } }, error: null }),
      },
      rpc,
    })
    const profile = { id: 'browser-profile', name: '지연검증' }
    const submission = { game: 'three-cushion' as const, score: 2, durationMs: 20_000 }

    await expect(saveScore(profile, submission, Promise.resolve('active-run'))).rejects.toThrow('network timeout')
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'submit_arcade_score',
      'submit_arcade_score',
    ])
  })
})
