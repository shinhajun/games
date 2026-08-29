import { Fragment, useEffect, useRef, useState } from 'react'
import { Check, ClipboardList, Dice5, Hand, X } from 'lucide-react'
import { useProfile } from '../useProfile'
import { GameHeader } from '../components/GameHeader'
import { GameResultDialog } from '../components/GameResultDialog'
import { DiceScene } from '../game/yacht/DiceScene'
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
import { startScoreRun, submitScore } from '../lib/leaderboard'
import { nowMs } from '../lib/time'
import type { ScoreSubmission } from '../types'

const freshDice = () => [1, 2, 3, 4, 5]
export function YachtPage() {
  const { profile } = useProfile()
  const startedAt = useRef(0)
  const scoreRun = useRef<Promise<string> | null>(null)
  const pendingScore = useRef<ScoreSubmission | null>(null)
  const rollLaunchPending = useRef(false)
  const scoreRunRetryTimer = useRef<number | null>(null)
  const runGeneration = useRef(0)
  const [dice, setDice] = useState(freshDice)
  const [held, setHeld] = useState([false, false, false, false, false])
  const [rolls, setRolls] = useState(0)
  const [rollNonce, setRollNonce] = useState(0)
  const [rolling, setRolling] = useState(false)
  const [scores, setScores] = useState<Partial<Record<YachtCategory, number>>>({})
  const [selectedCategory, setSelectedCategory] = useState<YachtCategory | null>(null)
  const [scorecardOpen, setScorecardOpen] = useState(false)
  const [finished, setFinished] = useState(false)
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const total = totalYachtScore(scores)
  const upperSubtotal = upperYachtSubtotal(scores)
  const upperBonus = upperYachtBonus(scores)
  const round = Object.keys(scores).length + 1
  const selectedCategoryInfo = selectedCategory
    ? YACHT_CATEGORIES.find((category) => category.id === selectedCategory) ?? null
    : null
  const selectedCategoryScore = selectedCategory ? scoreYachtCategory(selectedCategory, dice) : null

  useEffect(() => () => {
    if (scoreRunRetryTimer.current !== null) window.clearTimeout(scoreRunRetryTimer.current)
  }, [])

  useEffect(() => {
    if (!scorecardOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setSelectedCategory(null)
      setScorecardOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [scorecardOpen])

  function beginScoreRun() {
    if (scoreRun.current) return scoreRun.current
    const run = startScoreRun('yacht')
    scoreRun.current = run
    void run.catch(() => {
      if (scoreRun.current === run) scoreRun.current = null
    })
    return run
  }

  function keepScoreRunAlive(generation = runGeneration.current) {
    if (scoreRun.current) return
    void beginScoreRun().catch(() => {
      if (generation !== runGeneration.current || scoreRunRetryTimer.current !== null) return
      scoreRunRetryTimer.current = window.setTimeout(() => {
        scoreRunRetryTimer.current = null
        keepScoreRunAlive(generation)
      }, 5000)
    })
  }

  function toggleHold(index: number) {
    if (rolls === 0 || rolling) return
    setHeld((current) => current.map((value, currentIndex) => currentIndex === index ? !value : value))
  }

  function roll() {
    if (rollLaunchPending.current || rolling || rolls >= 3) return
    rollLaunchPending.current = true
    setSelectedCategory(null)
    setScorecardOpen(false)
    if (startedAt.current === 0) {
      startedAt.current = nowMs()
    }
    keepScoreRunAlive()
    setRolling(true)
    setRollNonce((value) => value + 1)
  }

  function completePhysicalRoll(nextDice: number[]) {
    setDice(nextDice)
    setSelectedCategory(null)
    setRolling(false)
    rollLaunchPending.current = false
    setRolls((value) => value + 1)
  }

  function selectCategory(category: YachtCategory) {
    if (rolls === 0 || rolling || scores[category] !== undefined) return
    setSelectedCategory(category)
  }

  function confirmCategory() {
    if (!selectedCategory) return
    recordCategory(selectedCategory)
  }

  function recordCategory(category: YachtCategory) {
    if (rolls === 0 || rolling || scores[category] !== undefined) return
    const score = scoreYachtCategory(category, dice)
    const nextScores = { ...scores, [category]: score }
    setScores(nextScores)
    setDice(freshDice())
    setHeld([false, false, false, false, false])
    setRolls(0)
    setSelectedCategory(null)
    setScorecardOpen(false)
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
    runGeneration.current += 1
    rollLaunchPending.current = false
    if (scoreRunRetryTimer.current !== null) window.clearTimeout(scoreRunRetryTimer.current)
    scoreRunRetryTimer.current = null
    startedAt.current = 0
    scoreRun.current = null
    pendingScore.current = null
    setDice(freshDice())
    setHeld([false, false, false, false, false])
    setRolls(0)
    setScores({})
    setSelectedCategory(null)
    setScorecardOpen(false)
    setFinished(false)
    setSaved('idle')
  }

  return (
    <div className="play-page yacht-page">
      <GameHeader title="Yacht Dice">
        <div className="yacht-total"><small>총점</small><strong>{total}<em>/{YACHT_MAX_SCORE}</em></strong></div>
      </GameHeader>

      <section className="yacht-layout page-wrap">
        <div className="dice-column">
          <div className="dice-stage">
            <DiceScene values={dice} held={held} rolling={rolling} rollNonce={rollNonce} onToggle={toggleHold} onRollComplete={completePhysicalRoll} />
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
            <button className="roll-button" onClick={roll} disabled={rolling || rolls >= 3}>
              {rolling ? <><span className="button-loader" /> 굴리는 중</> : rolls === 0 ? <><Dice5 /> 주사위 굴리기</> : rolls < 3 ? <><Dice5 /> 다시 굴리기 <small>{3 - rolls}회 남음</small></> : <><Hand /> 점수를 선택하세요</>}
            </button>
            <button
              className="scorecard-toggle"
              onClick={() => setScorecardOpen(true)}
              aria-expanded={scorecardOpen}
              aria-controls="yacht-scorecard"
            >
              <ClipboardList /> 점수판 <small>{Math.min(round, YACHT_CATEGORIES.length)}/{YACHT_CATEGORIES.length}</small>
            </button>
          </div>
        </div>

        <button
          className={`scorecard-backdrop ${scorecardOpen ? 'open' : ''}`}
          onClick={() => { setSelectedCategory(null); setScorecardOpen(false) }}
          aria-label="점수판 닫기"
          tabIndex={scorecardOpen ? 0 : -1}
        />
        <aside
          id="yacht-scorecard"
          className={`scorecard ${scorecardOpen ? 'open' : ''} ${selectedCategory ? 'has-pending' : ''}`}
          aria-label="Yacht 점수판"
        >
          <header>
            <div><h2>점수판</h2><small>족보 선택 후 확인해야 기록됩니다.</small></div>
            <button
              className="scorecard-close"
              onClick={() => { setSelectedCategory(null); setScorecardOpen(false) }}
              aria-label="점수판 닫기"
            ><X /></button>
          </header>
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
                    className={`${locked !== undefined ? 'locked' : ''} ${candidate === category.max ? 'max-candidate' : ''} ${selectedCategory === category.id ? 'selected' : ''}`}
                    onClick={() => selectCategory(category.id)}
                    disabled={locked !== undefined || rolls === 0 || rolling}
                    aria-pressed={selectedCategory === category.id}
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
          {selectedCategoryInfo && selectedCategoryScore !== null && (
            <div className="score-confirm">
              <div><small>기록 전 확인</small><strong>{selectedCategoryInfo.label} <em>{selectedCategoryScore}점</em></strong></div>
              <button className="score-confirm-cancel" onClick={() => setSelectedCategory(null)}>취소</button>
              <button className="score-confirm-submit" onClick={confirmCategory}>이 점수 기록</button>
            </div>
          )}
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
