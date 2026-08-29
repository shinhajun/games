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
})
