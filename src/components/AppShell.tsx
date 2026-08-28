import { Cloud, Gamepad2, Trophy } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useProfile } from '../useProfile'
import { isCloudConnected } from '../lib/leaderboard'

export function AppShell() {
  const { profile } = useProfile()
  const { pathname } = useLocation()
  const isGameRoute = pathname.startsWith('/play/')

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
            <span className={`cloud-state ${isCloudConnected ? 'online' : ''}`} title={isCloudConnected ? 'Supabase 연결됨' : '로컬 기록 모드'}>
              <Cloud size={13} /> {isCloudConnected ? 'LIVE' : 'LOCAL'}
            </span>
            <span className="player-avatar">{profile?.name.slice(0, 1) ?? '?'}</span>
            <span>{profile?.name ?? 'PLAYER'}</span>
          </div>
        </header>
      )}
      <main><Outlet /></main>
      {!isGameRoute && (
        <footer className="site-footer">
          <span>HAJUN ARCADE © {new Date().getFullYear()}</span>
          <span>CAROM · DICE · GLORY</span>
        </footer>
      )}
    </div>
  )
}
