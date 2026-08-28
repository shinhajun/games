import { CloudOff } from 'lucide-react'
import { Leaderboard } from '../components/Leaderboard'
import { isCloudConnected } from '../lib/leaderboard'

export function LeaderboardPage() {
  return (
    <div className="leaderboard-page page-wrap">
      <header className="page-title-block">
        <span className="eyebrow">HALL OF FAME</span>
        <h1>기록은 거짓말하지<br /><em>않으니까.</em></h1>
        <p>종목별 최고 기록. 동점일 때는 더 빠르게 완주한 플레이어가 앞섭니다.</p>
        {!isCloudConnected && <div className="local-notice"><CloudOff size={16} /> Supabase 연결 전이라 현재 기기의 기록만 표시됩니다.</div>}
      </header>
      <div className="leaderboard-grid">
        <Leaderboard game="three-cushion" />
        <Leaderboard game="four-ball" />
        <Leaderboard game="yacht" />
      </div>
    </div>
  )
}
