import { useEffect, useState } from 'react'
import { Cloud, Gamepad2, Trophy } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useProfile } from '../useProfile'
import { prepareCloudLeaderboard } from '../lib/leaderboard'

export function AppShell() {
  const { profile } = useProfile()
  const { pathname } = useLocation()
  const isGameRoute = pathname.startsWith('/play/')
  const [cloudState, setCloudState] = useState<'checking' | 'ready' | 'error'>('checking')

  function connectCloud() {
    setCloudState('checking')
    void prepareCloudLeaderboard()
      .then(() => setCloudState('ready'))
      .catch(() => setCloudState('error'))
  }

  useEffect(() => {
    let cancelled = false
    void prepareCloudLeaderboard()
      .then(() => { if (!cancelled) setCloudState('ready') })
      .catch(() => { if (!cancelled) setCloudState('error') })
    return () => { cancelled = true }
  }, [])

  return (
    <div className={`app-shell ${isGameRoute ? 'game-shell' : ''}`}>
      {!isGameRoute && (
        <header className="site-header">
          <NavLink className="brand" to="/" aria-label="Hajun Arcade 홈">
            <span className="brand-mark"><Gamepad2 size={20} strokeWidth={2.4} /></span>
            <span><strong>HAJUN</strong><small>ARCADE</small></span>
          </NavLink>
          <nav className="main-nav" aria-label="주 메뉴">
            <NavLink to="/" end>게임</NavLink>
            <NavLink to="/leaderboard"><Trophy size={15} /> 순위</NavLink>
          </nav>
          <div className="header-player">
            <button
              type="button"
              className={`cloud-state ${cloudState === 'ready' ? 'online' : cloudState}`}
              title={cloudState === 'ready' ? 'Supabase 연결됨' : cloudState === 'checking' ? 'Supabase 연결 중' : 'Supabase 재연결'}
              onClick={cloudState === 'error' ? connectCloud : undefined}
              disabled={cloudState !== 'error'}
            >
              <Cloud size={13} /> {cloudState === 'ready' ? 'LIVE' : cloudState === 'checking' ? 'CONNECT' : 'RETRY'}
            </button>
            <span className="player-avatar">{profile?.name.slice(0, 1) ?? '?'}</span>
            <span>{profile?.name ?? 'PLAYER'}</span>
          </div>
        </header>
      )}
      <main><Outlet /></main>
    </div>
  )
}
