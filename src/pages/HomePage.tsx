import { ArrowUpRight, CircleDot, Dices, MousePointer2, Trophy } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Leaderboard } from '../components/Leaderboard'

const games = [
  {
    code: 'three-cushion', number: '01', tag: 'CAROM · 5 LIVES', title: '3쿠션', subtitle: 'THREE CUSHION',
    description: '두 목적구와 세 번의 쿠션. 당점, 세기, 스트로크까지 설계하는 정교한 한 큐.', stat: '3 CUSHIONS', color: 'emerald', icon: CircleDot,
  },
  {
    code: 'four-ball', number: '02', tag: 'K-CAROM · 5 LIVES', title: '4구', subtitle: 'FOUR BALL',
    description: '상대 수구를 피해 두 적구를 모두 맞혀라. 단순해 보여도 길은 무수합니다.', stat: '2 RED BALLS', color: 'coral', icon: MousePointer2,
  },
  {
    code: 'yacht', number: '03', tag: 'DICE · 12 ROUNDS', title: 'Yacht Dice', subtitle: 'ROLL YOUR FATE',
    description: '다섯 주사위, 세 번의 롤. 홀드할 것과 버릴 것을 골라 297점에 도전하세요.', stat: 'MAX 297', color: 'amber', icon: Dices,
  },
] as const

export function HomePage() {
  return (
    <div className="home-page page-wrap">
      <section className="hero-section">
        <div className="hero-copy">
          <span className="eyebrow"><span className="live-dot" /> THREE GAMES · ONE NAME</span>
          <h1>각도를 읽고,<br /><em>운을 굴리세요.</em></h1>
          <p>섬세한 한 큐부터 대담한 한 번의 롤까지.<br />브라우저에서 만나는 세 가지 3D 테이블 게임.</p>
          <div className="hero-actions">
            <Link className="primary-button" to="/play/three-cushion">첫 게임 시작 <ArrowUpRight /></Link>
            <Link className="text-button" to="/leaderboard"><Trophy size={17} /> 전체 순위 보기</Link>
          </div>
        </div>
        <div className="hero-orbit" aria-hidden="true">
          <div className="orbit-ring ring-one" />
          <div className="orbit-ring ring-two" />
          <div className="hero-ball hero-ball-white" />
          <div className="hero-ball hero-ball-red" />
          <div className="hero-die"><span>●</span><span>●</span><span>●</span></div>
          <div className="orbit-label">3D PLAYGROUND</div>
        </div>
      </section>

      <section className="game-section">
        <header className="section-heading">
          <div><span className="eyebrow">CHOOSE YOUR TABLE</span><h2>오늘의 게임</h2></div>
          <p>모든 게임은 설치 없이 바로 시작됩니다.</p>
        </header>
        <div className="game-grid">
          {games.map((game) => {
            const Icon = game.icon
            return (
              <Link to={`/play/${game.code}`} className={`game-card ${game.color}`} key={game.code}>
                <span className="game-number">{game.number}</span>
                <span className="game-icon"><Icon /></span>
                <span className="game-tag">{game.tag}</span>
                <h3>{game.title}</h3>
                <strong>{game.subtitle}</strong>
                <p>{game.description}</p>
                <footer><span>{game.stat}</span><span className="circle-link"><ArrowUpRight /></span></footer>
              </Link>
            )
          })}
        </div>
      </section>

      <section className="home-rankings">
        <div className="rankings-copy">
          <span className="eyebrow">HALL OF FAME</span>
          <h2>한 번의 기록은<br /><em>오래 남습니다.</em></h2>
          <p>각 종목의 최고 점수만 순위에 반영됩니다. 동점이면 더 짧은 플레이 시간이 앞섭니다.</p>
          <Link className="text-button" to="/leaderboard">전체 순위표 <ArrowUpRight size={17} /></Link>
        </div>
        <Leaderboard game="yacht" compact />
      </section>
    </div>
  )
}
