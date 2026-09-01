import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { Apple, Clock3, Grid3X3, Sparkles, Target } from 'lucide-react'
import { GameHeader } from '../components/GameHeader'
import { GameResultDialog } from '../components/GameResultDialog'
import {
  APPLE_COLUMNS,
  APPLE_COUNT,
  APPLE_ROUND_MS,
  APPLE_TARGET,
  appleCellFromPoint,
  appleIndicesInSelection,
  appleSelectionTotal,
  clearAppleSelection,
  createAppleBoard,
  normalizeAppleSelection,
  type AppleSelection,
} from '../game/apple/engine'
import { saveScore, startScoreRun } from '../lib/leaderboard'
import { nowMs } from '../lib/time'
import { useProfile } from '../useProfile'
import type { ScoreSubmission } from '../types'

type GameStatus = 'ready' | 'playing' | 'finished'

interface DragState {
  pointerId: number
  selection: AppleSelection
}

function formatTime(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function ApplePage() {
  const { profile } = useProfile()
  const boardElement = useRef<HTMLDivElement>(null)
  const drag = useRef<DragState | null>(null)
  const timer = useRef<number | null>(null)
  const flashTimer = useRef<number | null>(null)
  const invalidTimer = useRef<number | null>(null)
  const startedAt = useRef(0)
  const ending = useRef(false)
  const scoreRef = useRef(0)
  const scoreRun = useRef<Promise<string> | null>(null)
  const pendingScore = useRef<ScoreSubmission | null>(null)
  const [board, setBoard] = useState(createAppleBoard)
  const [status, setStatus] = useState<GameStatus>('ready')
  const [selection, setSelection] = useState<AppleSelection | null>(null)
  const [clearedFlash, setClearedFlash] = useState<Set<number>>(new Set())
  const [invalid, setInvalid] = useState(false)
  const [score, setScore] = useState(0)
  const [timeLeft, setTimeLeft] = useState(APPLE_ROUND_MS)
  const [perfectClear, setPerfectClear] = useState(false)
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const selectedIndices = useMemo(() => selection ? new Set(appleIndicesInSelection(selection)) : new Set<number>(), [selection])
  const selectedTotal = selection ? appleSelectionTotal(board, selection) : 0
  const selectedBounds = selection ? normalizeAppleSelection(selection) : null

  useEffect(() => () => {
    if (timer.current !== null) window.clearInterval(timer.current)
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current)
    if (invalidTimer.current !== null) window.clearTimeout(invalidTimer.current)
  }, [])

  function beginScoreRun() {
    if (scoreRun.current) return scoreRun.current
    const run = startScoreRun('apple')
    scoreRun.current = run
    void run.catch(() => {
      if (scoreRun.current === run) scoreRun.current = null
    })
    return run
  }

  function saveFinalScore() {
    const submission = pendingScore.current
    if (!profile || !submission) {
      setSaved('error')
      return
    }
    setSaved('saving')
    void saveScore(profile, submission, scoreRun.current)
      .then((runId) => {
        scoreRun.current = Promise.resolve(runId)
        setSaved('saved')
      })
      .catch(() => {
        scoreRun.current = null
        setSaved('error')
      })
  }

  function finishGame(finalScore: number, clearedAll = false) {
    if (ending.current) return
    ending.current = true
    if (timer.current !== null) window.clearInterval(timer.current)
    timer.current = null
    const durationMs = Math.max(0, Math.min(APPLE_ROUND_MS, nowMs() - startedAt.current))
    setPerfectClear(clearedAll)
    setStatus('finished')
    if (!clearedAll) setTimeLeft(0)
    pendingScore.current = { game: 'apple', score: finalScore, durationMs }
    saveFinalScore()
  }

  function startGame() {
    if (status === 'playing' || startedAt.current > 0) return
    ending.current = false
    scoreRef.current = 0
    setScore(0)
    setTimeLeft(APPLE_ROUND_MS)
    setSelection(null)
    setStatus('playing')
    startedAt.current = nowMs()
    void beginScoreRun().catch(() => undefined)
    const endsAt = startedAt.current + APPLE_ROUND_MS
    timer.current = window.setInterval(() => {
      const remaining = Math.max(0, endsAt - nowMs())
      setTimeLeft(remaining)
      if (remaining <= 0) finishGame(scoreRef.current)
    }, 200)
  }

  function reset() {
    if (saved === 'saving' || saved === 'error') return
    if (timer.current !== null) window.clearInterval(timer.current)
    timer.current = null
    ending.current = false
    drag.current = null
    startedAt.current = 0
    scoreRun.current = null
    pendingScore.current = null
    scoreRef.current = 0
    setBoard(createAppleBoard())
    setStatus('ready')
    setSelection(null)
    setClearedFlash(new Set())
    setInvalid(false)
    setScore(0)
    setTimeLeft(APPLE_ROUND_MS)
    setPerfectClear(false)
    setSaved('idle')
  }

  function pointerCell(clientX: number, clientY: number) {
    const rect = boardElement.current?.getBoundingClientRect()
    if (!rect) return null
    return appleCellFromPoint(clientX - rect.left, clientY - rect.top, rect.width, rect.height)
  }

  function beginSelection(event: PointerEvent<HTMLDivElement>) {
    if (status !== 'playing') return
    const cell = pointerCell(event.clientX, event.clientY)
    if (!cell) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const nextSelection = { start: cell, end: cell }
    drag.current = { pointerId: event.pointerId, selection: nextSelection }
    setSelection(nextSelection)
  }

  function moveSelection(event: PointerEvent<HTMLDivElement>) {
    const currentDrag = drag.current
    if (!currentDrag || currentDrag.pointerId !== event.pointerId) return
    const cell = pointerCell(event.clientX, event.clientY)
    if (!cell) return
    event.preventDefault()
    const nextSelection = { ...currentDrag.selection, end: cell }
    currentDrag.selection = nextSelection
    setSelection(nextSelection)
  }

  function showInvalidSelection() {
    setInvalid(true)
    if (invalidTimer.current !== null) window.clearTimeout(invalidTimer.current)
    invalidTimer.current = window.setTimeout(() => {
      invalidTimer.current = null
      setInvalid(false)
    }, 260)
  }

  function endSelection(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    const currentDrag = drag.current
    if (!currentDrag || currentDrag.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    drag.current = null
    setSelection(null)
    if (cancelled) return

    const result = clearAppleSelection(board, currentDrag.selection)
    if (!result.valid) {
      showInvalidSelection()
      return
    }

    setBoard(result.board)
    setClearedFlash(new Set(result.clearedIndices))
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => {
      flashTimer.current = null
      setClearedFlash(new Set())
    }, 360)
    const nextScore = scoreRef.current + result.score
    scoreRef.current = nextScore
    setScore(nextScore)
    if (nextScore === APPLE_COUNT) finishGame(nextScore, true)
  }

  const timeProgress = Math.max(0, Math.min(1, timeLeft / APPLE_ROUND_MS))
  const urgent = status === 'playing' && timeLeft <= 15_000

  return (
    <div className="play-page apple-page">
      <GameHeader title="사과 10">
        <div className="apple-hud" aria-label={`점수 ${score}점, 남은 시간 ${formatTime(timeLeft)}`}>
          <span><small>점수</small><strong>{score}<em>/{APPLE_COUNT}</em></strong></span>
          <span className={urgent ? 'urgent' : ''}><small>남은 시간</small><strong>{formatTime(timeLeft)}</strong></span>
        </div>
      </GameHeader>

      <section className="apple-layout page-wrap">
        <div className={`apple-board-panel ${invalid ? 'invalid' : ''}`}>
          <header className="apple-board-status">
            <span><Grid3X3 /> 17 × 10</span>
            <strong className={selectedTotal === APPLE_TARGET ? 'valid' : selectedTotal > APPLE_TARGET ? 'over' : ''}>
              {selection ? <>선택 합계 <em>{selectedTotal}</em></> : <>직사각형으로 사과를 묶으세요</>}
            </strong>
            <span><Target /> 목표 {APPLE_TARGET}</span>
          </header>
          <div className="apple-board-fit">
            <div
              ref={boardElement}
              className={`apple-board ${selectedTotal === APPLE_TARGET ? 'selection-valid' : ''}`}
              role="application"
              aria-label="17열 10행 사과 게임판. 드래그한 직사각형 속 사과 합계를 10으로 만드세요."
              onPointerDown={beginSelection}
              onPointerMove={moveSelection}
              onPointerUp={(event) => endSelection(event)}
              onPointerCancel={(event) => endSelection(event, true)}
            >
              {board.map((value, index) => {
                const row = Math.floor(index / APPLE_COLUMNS)
                const column = index % APPLE_COLUMNS
                const isSelected = selectedIndices.has(index)
                const edgeClasses = isSelected && selectedBounds
                  ? `${row === selectedBounds.top ? 'edge-top' : ''} ${row === selectedBounds.bottom ? 'edge-bottom' : ''} ${column === selectedBounds.left ? 'edge-left' : ''} ${column === selectedBounds.right ? 'edge-right' : ''}`
                  : ''
                return (
                  <div className={`apple-cell ${isSelected ? 'selected' : ''} ${edgeClasses}`} key={index} aria-hidden="true">
                    {value !== null && (
                      <span className="apple-fruit">
                        <i />
                        <strong>{value}</strong>
                      </span>
                    )}
                    {value === null && clearedFlash.has(index) && <span className="apple-pop"><Sparkles /></span>}
                  </div>
                )
              })}
              {status === 'ready' && (
                <div className="apple-start-overlay">
                  <span className="apple-start-icon"><Apple /></span>
                  <small>SUM TO TEN</small>
                  <strong>2분 동안<br />사과를 수확하세요.</strong>
                  <button onClick={startGame}>120초 시작</button>
                </div>
              )}
            </div>
          </div>
          <div className="apple-time-track" aria-hidden="true"><i style={{ transform: `scaleX(${timeProgress})` }} /></div>
        </div>

        <aside className="apple-rules">
          <div className="apple-target-orb"><small>MAKE</small><strong>10</strong><span>합계</span></div>
          <div className="apple-rule-copy">
            <span className="eyebrow">HOW TO PLAY</span>
            <h2>드래그하고,<br />정확히 10.</h2>
            <ol>
              <li><i>1</i><span>사과를 직사각형으로 묶습니다.</span></li>
              <li><i>2</i><span>안쪽 숫자의 합이 10이면 제거됩니다.</span></li>
              <li><i>3</i><span>사과 한 개마다 1점을 얻습니다.</span></li>
            </ol>
          </div>
          <p><Clock3 /> 빈칸은 0으로 계산되어 떨어진 사과도 함께 묶을 수 있습니다.</p>
        </aside>
      </section>

      {status === 'finished' && (
        <GameResultDialog
          titleId="apple-result-title"
          score={score}
          maxScore={APPLE_COUNT}
          message={perfectClear ? `남은 시간 ${formatTime(timeLeft)} — 모든 사과를 수확했습니다.` : '120초 동안 수확한 사과가 최고 기록에 반영됩니다.'}
          saved={saved}
          onRetrySave={saveFinalScore}
          onRestart={reset}
        />
      )}
    </div>
  )
}
