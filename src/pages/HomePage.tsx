import { ArrowRight, CircleDot, Dices, MousePointer2, Trophy } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Leaderboard } from '../components/Leaderboard'

const games = [
  {
    code: 'three-cushion',
    tag: 'CAROM · 5 LIVES',
    title: '3쿠션',
    subtitle: 'THREE CUSHION',
    description: '두 목적구를 세 번의 쿠션을 거쳐 맞히세요.',
    stat: '3 CUSHIONS',
    color: 'emerald',
    icon: CircleDot,
  },
  {
    code: 'four-ball',
    tag: 'K-CAROM · 5 LIVES',
    title: '4구',
    subtitle: 'FOUR BALL',
    description: '노란 공을 피하고 빨간 공 두 개를 맞히세요.',
    stat: '2 RED BALLS',
    color: 'coral',
    icon: MousePointer2,
  },
  {
    code: 'yacht',
    tag: 'DICE · 12 ROUNDS',
    title: 'Yacht Dice',
    subtitle: 'ROLL YOUR FATE',
    description: '15개 족보와 63점 보너스로 최고점을 만드세요.',
    stat: 'MAX 359',
    color: 'amber',
    icon: Dices,
  },
] as const

export function HomePage() {
  return (
    <div className="home-page">
      <section className="home-launch" aria-labelledby="home-title">
        <header className="home-intro">
          <div>
            <span className="eyebrow">PICK &amp; PLAY</span>
            <h1 id="home-title">게임을 고르세요.</h1>
            <p>세 게임 모두 설치 없이 바로 시작할 수 있습니다.</p>
          </div>
          <Link className="home-rank-link" to="/leaderboard">
            <Trophy size={17} /> 전체 순위
          </Link>
        </header>

        <div className="home-launch-grid">
          {games.map((game) => {
            const Icon = game.icon
            return (
              <Link to={`/play/${game.code}`} className={`home-game-card ${game.color}`} key={game.code}>
                <header>
                  <span className="home-game-icon"><Icon /></span>
                  <span className="home-game-format">{game.tag}</span>
                </header>
                <div className="home-game-copy">
                  <small>{game.subtitle}</small>
                  <h2>{game.title}</h2>
                  <p>{game.description}</p>
                </div>
                <footer>
                  <span>{game.stat}</span>
                  <strong>바로 플레이 <ArrowRight size={17} /></strong>
                </footer>
              </Link>
            )
          })}
        </div>
      </section>

      <section className="home-scoreboards" aria-labelledby="home-rankings-title">
        <header>
          <div>
            <span className="eyebrow">LEADERBOARD</span>
            <h2 id="home-rankings-title">게임별 TOP 5</h2>
          </div>
          <Link className="text-button" to="/leaderboard">전체 순위 보기 <ArrowRight size={16} /></Link>
        </header>
        <div className="home-leaderboard-grid">
          <Leaderboard game="three-cushion" compact />
          <Leaderboard game="four-ball" compact />
          <Leaderboard game="yacht" compact />
        </div>
      </section>
    </div>
  )
}
