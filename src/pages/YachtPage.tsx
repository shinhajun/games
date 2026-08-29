import { Fragment, useEffect, useRef, useState } from 'react'
import { Check, Dice5, Hand } from 'lucide-react'
import { useProfile } from '../useProfile'
import { GameHeader, type RankedState } from '../components/GameHeader'
import { GameResultDialog } from '../components/GameResultDialog'
import { DICE_ROLL_DURATION_MS, DiceScene } from '../game/yacht/DiceScene'
import {
  scoreYachtCategory,
  totalYachtScore,
  upperYachtBonus,
  upperYachtSubtotal,
  YACHT_CATEGORIES,
  YACHT_MAX_SCORE,
  YACHT_UPPER_BONUS_THRESHOLD,
  type YachtCategory,
} from '../game/yacht/scoring'
import { prepareCloudLeaderboard, startScoreRun, submitScore } from '../lib/leaderboard'
import { nowMs } from '../lib/time'
import type { ScoreSubmission } from '../types'

const freshDice = () => [1, 2, 3, 4, 5]
export function YachtPage() {
  const { profile } = useProfile()
  const startedAt = useRef(0)
  const scoreRun = useRef<Promise<string> | null>(null)
  const pendingScore = useRef<ScoreSubmission | null>(null)
  const rollPending = useRef(false)
  const runGeneration = useRef(0)
  const rollTimer = useRef<number | null>(null)
  const [dice, setDice] = useState(freshDice)
  const [held, setHeld] = useState([false, false, false, false, false])
  const [rolls, setRolls] = useState(0)
  const [rollNonce, setRollNonce] = useState(0)
  const [rolling, setRolling] = useState(false)
  const [scores, setScores] = useState<Partial<Record<YachtCategory, number>>>({})
  const [finished, setFinished] = useState(false)
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [rankedState, setRankedState] = useState<RankedState>('checking')
  const total = totalYachtScore(scores)
  const upperSubtotal = upperYachtSubtotal(scores)
  const upperBonus = upperYachtBonus(scores)
  const round = Object.keys(scores).length + 1

  useEffect(() => () => {
    if (rollTimer.current !== null) window.clearTimeout(rollTimer.current)
  }, [])

  useEffect(() => {
    let cancelled = false
    void prepareCloudLeaderboard()
      .then(() => { if (!cancelled) setRankedState('ready') })
      .catch(() => { if (!cancelled) setRankedState('error') })
    return () => { cancelled = true }
  }, [profile])

  function reconnectRanked() {
    setRankedState('checking')
    void prepareCloudLeaderboard()
      .then(() => setRankedState('ready'))
      .catch(() => setRankedState('error'))
  }

  function beginScoreRun() {
    if (scoreRun.current) return scoreRun.current
    setRankedState('checking')
    const run = startScoreRun('yacht')
      .then((runId) => {
        setRankedState('ready')
        return runId
      })
      .catch((error: unknown) => {
        scoreRun.current = null
        setRankedState('error')
        throw error
      })
    scoreRun.current = run
    return run
  }

  function toggleHold(index: number) {
    if (rolls === 0 || rolling) return
    setHeld((current) => current.map((value, currentIndex) => currentIndex === index ? !value : value))
  }

  async function roll() {
    if (rollPending.current || rolling || rolls >= 3) return
    const generation = runGeneration.current
    if (startedAt.current === 0) {
      rollPending.current = true
      try {
        await beginScoreRun()
      } catch {
        return
      } finally {
        rollPending.current = false
      }
      if (generation !== runGeneration.current) return
      startedAt.current = nowMs()
    }
    setDice((current) => current.map((value, index) => held[index] ? value : Math.floor(Math.random() * 6) + 1))
    setRollNonce((value) => value + 1)
    setRolling(true)
    rollTimer.current = window.setTimeout(() => {
      setRolling(false)
      setRolls((value) => value + 1)
      rollTimer.current = null
    }, DICE_ROLL_DURATION_MS)
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
      pendingScore.current = { game: 'yacht', score: finalScore, durationMs: nowMs() - startedAt.current }
      saveFinalScore()
    }
  }

  function saveFinalScore() {
    const submission = pendingScore.current
    const cloudRun = scoreRun.current
    if (!profile || !submission || !cloudRun) {
      setSaved('error')
      return
    }
    setSaved('saving')
    void cloudRun.then((runId) => submitScore(profile, submission, runId))
      .then(() => setSaved('saved'))
      .catch(() => setSaved('error'))
  }

  function restart() {
    if (saved === 'saving' || saved === 'error') return
    if (rollTimer.current !== null) window.clearTimeout(rollTimer.current)
    rollTimer.current = null
    runGeneration.current += 1
    rollPending.current = false
    startedAt.current = 0
    scoreRun.current = null
    pendingScore.current = null
    setDice(freshDice())
    setHeld([false, false, false, false, false])
    setRolls(0)
    setScores({})
    setFinished(false)
    setSaved('idle')
  }

  return (
    <div className="play-page yacht-page">
      <GameHeader title="Yacht Dice" rankedState={rankedState} onRetry={reconnectRanked}>
        <div className="yacht-total"><small>총점</small><strong>{total}<em>/{YACHT_MAX_SCORE}</em></strong></div>
      </GameHeader>

      <section className="yacht-layout page-wrap">
        <div className="dice-column">
          <div className="dice-stage">
            <DiceScene values={dice} held={held} rolling={rolling} rollNonce={rollNonce} onToggle={toggleHold} />
            <div className="dice-stage-label">라운드 {Math.min(round, YACHT_CATEGORIES.length)}<span>/{YACHT_CATEGORIES.length}</span></div>
            <div className="roll-indicator">{[1, 2, 3].map((roll) => <i className={roll <= rolls ? 'used' : ''} key={roll}>{roll}</i>)}</div>
          </div>

          <div className="dice-controls">
            <div className="hold-buttons" aria-label="주사위 홀드 선택">
              {dice.map((value, index) => (
                <button key={index} onClick={() => toggleHold(index)} className={held[index] ? 'held' : ''} disabled={rolls === 0 || rolling}>
                  <span>{value}</span><small>{held[index] ? <><Check size={12} /> 고정됨</> : '홀드'}</small>
                </button>
              ))}
            </div>
            <button className="roll-button" onClick={() => { void roll() }} disabled={rolling || rolls >= 3 || (rolls === 0 && rankedState !== 'ready')}>
              {rolls === 0 && rankedState === 'checking' ? <><span className="button-loader" /> 순위 연결 중</> : rolls === 0 && rankedState === 'error' ? <>서버 재연결 필요</> : rolling ? <><span className="button-loader" /> 굴리는 중</> : rolls === 0 ? <><Dice5 /> 주사위 굴리기</> : rolls < 3 ? <><Dice5 /> 다시 굴리기 <small>{3 - rolls}회 남음</small></> : <><Hand /> 점수를 선택하세요</>}
            </button>
          </div>
        </div>

        <aside className="scorecard">
          <header><h2>점수판</h2></header>
          <div className="scorecard-labels"><span>족보</span><span>조건</span><span>점수</span></div>
          <div className="score-rows">
            {YACHT_CATEGORIES.map((category, index) => {
              const locked = scores[category.id]
              const candidate = rolls > 0 ? scoreYachtCategory(category.id, dice) : null
              return (
                <Fragment key={category.id}>
                  {index === 6 && (
                    <div
                      className={`score-bonus-row ${upperBonus ? 'earned' : ''}`}
                      aria-label={`상단 보너스, 1부터 6까지 합계 ${upperSubtotal}점, ${upperBonus ? '35점 획득' : `${YACHT_UPPER_BONUS_THRESHOLD - upperSubtotal}점 남음`}`}
                    >
                      <span className="category-index">B</span>
                      <strong>상단 보너스</strong>
                      <small>1–6 합계 63+</small>
                      <em>{upperBonus || `${upperSubtotal}/63`}</em>
                    </div>
                  )}
                  <button
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
                </Fragment>
              )
            })}
          </div>
        </aside>
      </section>

      {finished && (
        <GameResultDialog
          titleId="yacht-result-title"
          score={total}
          maxScore={YACHT_MAX_SCORE}
          message="15개 족보와 상단 보너스를 모두 계산했습니다."
          saved={saved}
          onRetrySave={saveFinalScore}
          onRestart={restart}
          accent="amber"
        />
      )}
    </div>
  )
}
