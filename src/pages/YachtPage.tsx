import { useEffect, useRef, useState } from 'react'
import { Anchor, ArrowLeft, Check, Dice5, Hand, RotateCcw, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useProfile } from '../useProfile'
import { Leaderboard } from '../components/Leaderboard'
import { DiceScene } from '../game/yacht/DiceScene'
import { scoreYachtCategory, totalYachtScore, YACHT_CATEGORIES, type YachtCategory } from '../game/yacht/scoring'
import { submitScore } from '../lib/leaderboard'
import { nowMs } from '../lib/time'

const freshDice = () => [1, 2, 3, 4, 5]
const ROLL_DURATION_MS = 1480

export function YachtPage() {
  const { profile } = useProfile()
  const startedAt = useRef(0)
  const rollTimer = useRef<number | null>(null)
  const [dice, setDice] = useState(freshDice)
  const [held, setHeld] = useState([false, false, false, false, false])
  const [rolls, setRolls] = useState(0)
  const [rollNonce, setRollNonce] = useState(0)
  const [rolling, setRolling] = useState(false)
  const [scores, setScores] = useState<Partial<Record<YachtCategory, number>>>({})
  const [finished, setFinished] = useState(false)
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const total = totalYachtScore(scores)
  const round = Object.keys(scores).length + 1

  useEffect(() => () => {
    if (rollTimer.current !== null) window.clearTimeout(rollTimer.current)
  }, [])

  function toggleHold(index: number) {
    if (rolls === 0 || rolling) return
    setHeld((current) => current.map((value, currentIndex) => currentIndex === index ? !value : value))
  }

  function roll() {
    if (rolling || rolls >= 3) return
    if (startedAt.current === 0) startedAt.current = nowMs()
    setDice((current) => current.map((value, index) => held[index] ? value : Math.floor(Math.random() * 6) + 1))
    setRollNonce((value) => value + 1)
    setRolling(true)
    rollTimer.current = window.setTimeout(() => {
      setRolling(false)
      setRolls((value) => value + 1)
      rollTimer.current = null
    }, ROLL_DURATION_MS)
  }

  function chooseCategory(category: YachtCategory) {
    if (rolls === 0 || rolling || scores[category] !== undefined) return
    const score = scoreYachtCategory(category, dice)
    const nextScores = { ...scores, [category]: score }
    setScores(nextScores)
    setDice(freshDice())
    setHeld([false, false, false, false, false])
    setRolls(0)
    if (Object.keys(nextScores).length === YACHT_CATEGORIES.length) {
      const finalScore = totalYachtScore(nextScores)
      setFinished(true)
      if (profile) {
        setSaved('saving')
        void submitScore(profile, { game: 'yacht', score: finalScore, durationMs: nowMs() - startedAt.current })
          .then(() => setSaved('saved'))
          .catch(() => setSaved('error'))
      }
    }
  }

  function restart() {
    if (rollTimer.current !== null) window.clearTimeout(rollTimer.current)
    rollTimer.current = null
    startedAt.current = 0
    setDice(freshDice())
    setHeld([false, false, false, false, false])
    setRolls(0)
    setScores({})
    setFinished(false)
    setSaved('idle')
  }

  return (
    <div className="play-page yacht-page">
      <header className="play-header page-wrap">
        <Link to="/" className="back-link"><ArrowLeft size={17} /> 게임 선택</Link>
        <div className="play-title"><span className="eyebrow">YACHT DICE · CLASSIC 12</span><h1>Yacht Dice</h1></div>
        <div className="yacht-total"><small>TOTAL SCORE</small><strong>{total}<em>/297</em></strong></div>
      </header>

      <section className="yacht-layout page-wrap">
        <div className="dice-column">
          <div className="dice-stage">
            <DiceScene values={dice} held={held} rolling={rolling} rollNonce={rollNonce} onToggle={toggleHold} />
            <div className="dice-stage-label"><Anchor size={14} /> ROUND {Math.min(round, 12)}<span>/12</span></div>
            <div className="roll-indicator">{[1, 2, 3].map((roll) => <i className={roll <= rolls ? 'used' : ''} key={roll}>{roll}</i>)}</div>
          </div>

          <div className="dice-controls">
            <div className="hold-buttons" aria-label="주사위 홀드 선택">
              {dice.map((value, index) => (
                <button key={index} onClick={() => toggleHold(index)} className={held[index] ? 'held' : ''} disabled={rolls === 0 || rolling}>
                  <span>{value}</span><small>{held[index] ? <><Check size={12} /> HOLD</> : `DIE ${index + 1}`}</small>
                </button>
              ))}
            </div>
            <button className="roll-button" onClick={roll} disabled={rolling || rolls >= 3}>
              {rolling ? <><span className="button-loader" /> ROLLING</> : rolls === 0 ? <><Dice5 /> 주사위 굴리기</> : rolls < 3 ? <><Dice5 /> 다시 굴리기 <small>{3 - rolls} LEFT</small></> : <><Hand /> 점수를 선택하세요</>}
            </button>
            <p><Hand size={14} /> 주사위를 눌러 홀드 · 턴마다 최대 3회</p>
          </div>
        </div>

        <aside className="scorecard">
          <header><div><span className="eyebrow">SCORE CARD</span><h2>항해 일지</h2></div><span>{Object.keys(scores).length}<small>/12 FILLED</small></span></header>
          <div className="scorecard-labels"><span>CATEGORY</span><span>RULE</span><span>SCORE</span></div>
          <div className="score-rows">
            {YACHT_CATEGORIES.map((category, index) => {
              const locked = scores[category.id]
              const candidate = rolls > 0 ? scoreYachtCategory(category.id, dice) : null
              return (
                <button
                  key={category.id}
                  className={`${locked !== undefined ? 'locked' : ''} ${candidate === category.max ? 'max-candidate' : ''}`}
                  onClick={() => chooseCategory(category.id)}
                  disabled={locked !== undefined || rolls === 0 || rolling}
                  aria-label={`${category.label}, ${category.hint}, ${locked !== undefined ? `${locked}점 기록됨` : candidate === null ? '굴린 뒤 선택 가능' : `현재 ${candidate}점`}`}
                >
                  <span className="category-index">{String(index + 1).padStart(2, '0')}</span>
                  <strong>{category.label}</strong>
                  <small>{category.hint}</small>
                  <em>{locked !== undefined ? locked : candidate ?? '—'}</em>
                </button>
              )
            })}
          </div>
          <footer><span>TOTAL</span><strong>{total}</strong><small>MAX 297</small></footer>
        </aside>
      </section>

      {finished && (
        <div className="result-overlay" role="dialog" aria-modal="true" aria-labelledby="yacht-result-title">
          <div className="result-card yacht-result">
            <span className="result-spark"><Sparkles /></span>
            <span className="eyebrow">VOYAGE COMPLETE</span>
            <h2 id="yacht-result-title">오늘의 항해,<br /><em>{total}점.</em></h2>
            <p>{total >= 220 ? '완벽에 가까운 항해였습니다.' : total >= 160 ? '과감한 선택이 좋은 기록을 만들었어요.' : '다음 항해에는 더 좋은 바람이 불 겁니다.'}</p>
            <div className="result-score"><small>FINAL SCORE</small><strong>{total}<span>/297</span></strong><small>{saved === 'saving' ? '기록 저장 중…' : saved === 'saved' ? '최고 기록 반영 완료' : saved === 'error' ? '로컬 기록 저장 완료' : ''}</small></div>
            <div className="result-actions"><button className="primary-button" onClick={restart}><RotateCcw /> 다시 항해</button><Link className="text-button" to="/leaderboard">전체 순위 보기</Link></div>
            <Leaderboard key={saved} game="yacht" compact />
          </div>
        </div>
      )}
    </div>
  )
}
