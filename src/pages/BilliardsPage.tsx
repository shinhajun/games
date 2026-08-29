import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react'
import { Check, ChevronsDown, Eye, Heart, X } from 'lucide-react'
import { useProfile } from '../useProfile'
import { GameHeader } from '../components/GameHeader'
import { GameResultDialog } from '../components/GameResultDialog'
import { CueElevationControl } from '../components/CueElevationControl'
import {
  BilliardsScene,
  type BilliardsSceneHandle,
  type StrokeStyle,
} from '../game/billiards/BilliardsScene'
import {
  canLaunchCuePull,
  cuePullFromKeyboard,
  cuePullFraction,
  DEFAULT_CUE_ELEVATION,
  powerFromCuePull,
  spinForStrokePreset,
} from '../game/billiards/controls'
import { PHYSICS, type BilliardsMode, type ShotVerdict, type Vec2 } from '../game/billiards/engine'
import { BILLIARDS_STARTING_LIVES, settleBilliardsShot } from '../game/billiards/run'
import { startScoreRun, submitScore } from '../lib/leaderboard'
import { nowMs } from '../lib/time'
import type { ScoreSubmission } from '../types'

const gameTitle: Record<BilliardsMode, string> = {
  'three-cushion': '3쿠션',
  'four-ball': '4구',
}

const strokeOptions: { id: StrokeStyle; label: string; detail: string }[] = [
  { id: 'push', label: '밀어치기', detail: '상단 당점 · 긴 피니시' },
  { id: 'normal', label: '기본', detail: '중앙 당점 · 표준 피니시' },
  { id: 'punch', label: '끊어치기', detail: '하단 당점 · 짧은 피니시' },
]

interface AimGesture {
  pointerId: number
  startX: number
  startAngle: number
}

interface CuePullGesture {
  pointerId: number
  startY: number
  maximumTravel: number
  pull: number
}

function normalizeAngle(value: number) {
  return ((value + 180) % 360 + 360) % 360 - 180
}

export function BilliardsPage({ mode }: { mode: BilliardsMode }) {
  const sceneRef = useRef<BilliardsSceneHandle>(null)
  const startedAt = useRef(0)
  const finishTimer = useRef<number | null>(null)
  const scoreRun = useRef<Promise<string> | null>(null)
  const pendingScore = useRef<ScoreSubmission | null>(null)
  const launchPending = useRef(false)
  const runGeneration = useRef(0)
  const angleRef = useRef(10)
  const gestureRef = useRef<AimGesture | null>(null)
  const cuePullRef = useRef<CuePullGesture | null>(null)
  const { profile } = useProfile()
  const [sceneKey, setSceneKey] = useState(0)
  const [view, setView] = useState<'overview' | 'aim'>('overview')
  const [angle, setAngle] = useState(10)
  const [power, setPower] = useState(0)
  const [cuePull, setCuePull] = useState(0)
  const [cueTravel, setCueTravel] = useState(210)
  const [cuePulling, setCuePulling] = useState(false)
  const [spin, setSpin] = useState<Vec2>({ x: 0, y: 0 })
  const [stroke, setStroke] = useState<StrokeStyle>('normal')
  const [elevation, setElevation] = useState(DEFAULT_CUE_ELEVATION)
  const [lives, setLives] = useState(BILLIARDS_STARTING_LIVES)
  const [score, setScore] = useState(0)
  const [shooting, setShooting] = useState(false)
  const [lastVerdict, setLastVerdict] = useState<ShotVerdict | null>(null)
  const [finished, setFinished] = useState(false)
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  useEffect(() => () => {
    if (finishTimer.current !== null) window.clearTimeout(finishTimer.current)
  }, [])

  function beginScoreRun() {
    if (scoreRun.current) return scoreRun.current
    const run = startScoreRun(mode)
      .catch((error: unknown) => {
        scoreRun.current = null
        throw error
      })
    scoreRun.current = run
    return run
  }

  function updateAimAngle(nextAngle: number) {
    const normalized = normalizeAngle(nextAngle)
    angleRef.current = normalized
    setAngle(normalized)
  }

  function updateCuePull(pull: number) {
    const normalized = Math.max(0, Math.min(1, pull))
    setCuePull(normalized)
    setPower(powerFromCuePull(normalized))
  }

  function enterPlayerView(nextAngle = angleRef.current) {
    updateAimAngle(nextAngle)
    updateCuePull(0)
    setLastVerdict(null)
    setView('aim')
  }

  function selectStroke(nextStroke: StrokeStyle) {
    setStroke(nextStroke)
    setSpin((current) => spinForStrokePreset(nextStroke, current))
  }

  async function launchPulledShot(pull: number) {
    if (launchPending.current || shooting || lives <= 0 || !canLaunchCuePull(pull)) {
      updateCuePull(0)
      return
    }
    launchPending.current = true
    const generation = runGeneration.current
    const shotPower = powerFromCuePull(pull)
    try {
      if (startedAt.current === 0) {
        await beginScoreRun()
        if (generation !== runGeneration.current) return
        startedAt.current = nowMs()
      }
      const launched = sceneRef.current?.shoot({ angle: angleRef.current * Math.PI / 180, power: shotPower, spin, stroke, elevation }, pull) ?? false
      if (launched) {
        setPower(shotPower)
        setCuePull(0)
      }
    } catch {
      updateCuePull(0)
    } finally {
      launchPending.current = false
    }
  }

  function beginAimGesture(event: PointerEvent<HTMLDivElement>) {
    if (view !== 'aim' || shooting || lives <= 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startAngle: angleRef.current,
    }
  }

  function moveAimGesture(event: PointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    event.preventDefault()
    const dx = event.clientX - gesture.startX
    updateAimAngle(gesture.startAngle + dx / Math.max(event.currentTarget.clientWidth, 1) * 120)
  }

  function endAimGesture(event: PointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    gestureRef.current = null
  }

  function beginCuePull(event: PointerEvent<HTMLButtonElement>) {
    if (view !== 'aim' || shooting || lives <= 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const controlRect = event.currentTarget.getBoundingClientRect()
    const shaft = event.currentTarget.querySelector<HTMLElement>('.rail-cue-shaft')
    let maximumTravel = Math.max(24, controlRect.height - 18)
    if (shaft) {
      const shaftStyle = getComputedStyle(shaft)
      const handleCentre = Number.parseFloat(shaftStyle.top) + shaft.offsetHeight + 2
      maximumTravel = Math.max(24, controlRect.height - 18 - handleCentre)
    }
    setCueTravel(maximumTravel)
    cuePullRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      maximumTravel,
      pull: 0,
    }
    setCuePulling(true)
    updateCuePull(0)
  }

  function moveCuePull(event: PointerEvent<HTMLButtonElement>) {
    const gesture = cuePullRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    gesture.pull = cuePullFraction(gesture.startY, event.clientY, gesture.maximumTravel)
    updateCuePull(gesture.pull)
  }

  function endCuePull(event: PointerEvent<HTMLButtonElement>, cancelled = false) {
    const gesture = cuePullRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    event.stopPropagation()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    cuePullRef.current = null
    setCuePulling(false)
    if (cancelled) updateCuePull(0)
    else void launchPulledShot(gesture.pull)
  }

  function keyCuePull(event: KeyboardEvent<HTMLButtonElement>) {
    const nextPull = cuePullFromKeyboard(cuePull, event.key, event.shiftKey)
    if (nextPull !== null) {
      event.preventDefault()
      updateCuePull(nextPull)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      void launchPulledShot(cuePull)
    }
  }

  function wheelAim(event: WheelEvent<HTMLDivElement>) {
    if (view !== 'aim' || shooting) return
    event.preventDefault()
    const movement = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    updateAimAngle(angleRef.current + movement * 0.045)
  }

  function finishRun(finalScore: number) {
    setFinished(true)
    pendingScore.current = { game: mode, score: finalScore, durationMs: nowMs() - startedAt.current }
    saveFinalScore()
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
    if (finishTimer.current !== null) window.clearTimeout(finishTimer.current)
    finishTimer.current = null
    runGeneration.current += 1
    launchPending.current = false
    startedAt.current = 0
    scoreRun.current = null
    pendingScore.current = null
    setSceneKey((key) => key + 1)
    setView('overview')
    updateAimAngle(10)
    updateCuePull(0)
    setCuePulling(false)
    setElevation(DEFAULT_CUE_ELEVATION)
    setLives(BILLIARDS_STARTING_LIVES)
    setScore(0)
    setShooting(false)
    setLastVerdict(null)
    setFinished(false)
    setSaved('idle')
  }

  return (
    <div className="play-page billiards-page">
      <GameHeader title={gameTitle[mode]}>
        <div className="shot-score" aria-label={`현재 점수 ${score}점, 남은 목숨 ${lives}개`}>
          <span><small>점수</small><strong>{score}</strong></span>
          <div className="life-dots" aria-hidden="true">
            {Array.from({ length: BILLIARDS_STARTING_LIVES }, (_, index) => (
              <i key={index} className={index < lives ? 'active' : 'used'}><Heart /></i>
            ))}
          </div>
        </div>
      </GameHeader>

      <section className="billiards-layout">
        <div
          className="table-stage"
          onPointerDown={beginAimGesture}
          onPointerMove={moveAimGesture}
          onPointerUp={endAimGesture}
          onPointerCancel={endAimGesture}
          onWheel={wheelAim}
          role={view === 'aim' ? 'application' : undefined}
          aria-label={view === 'aim' ? '화면을 좌우로 밀어 조준하고 수구 표면에서 당점을 선택' : undefined}
        >
          <BilliardsScene
            key={`${mode}-${sceneKey}`}
            ref={sceneRef}
            mode={mode}
            view={view}
            angle={angle * Math.PI / 180}
            elevation={elevation}
            power={power}
            spin={spin}
            stroke={stroke}
            manualPull={cuePull}
            onAimSelected={(nextAngle) => enterPlayerView(nextAngle * 180 / Math.PI)}
            onSpinSelected={setSpin}
            onShotStart={() => { setShooting(true); setLastVerdict(null) }}
            onShotLaunched={() => { setCuePull(0); setCuePulling(false); setView('overview') }}
            onShotEnd={(verdict) => {
              const nextRun = settleBilliardsShot({ score, lives }, verdict.success)
              setLastVerdict(verdict)
              setLives(nextRun.lives)
              setScore(nextRun.score)
              setShooting(false)
              if (nextRun.finished) {
                finishTimer.current = window.setTimeout(() => {
                  finishTimer.current = null
                  finishRun(nextRun.score)
                }, 700)
              }
            }}
          />
          {lastVerdict && (
            <div className={`shot-verdict ${lastVerdict.success ? 'success' : 'miss'}`}>
              <span>{lastVerdict.success ? <Check /> : <X />}</span>
              <div><strong>{lastVerdict.title}</strong><small>{lastVerdict.detail}</small></div>
            </div>
          )}
          {!shooting && lives > 0 && (
            <div className="table-hint">{view === 'overview' ? '보낼 지점을 터치' : '당점 드래그 · 좌우 조준 · 큐 당기기'}</div>
          )}
        </div>

        <aside
          className={`shot-rail ${view} ${cuePulling ? 'pulling' : ''}`}
          aria-label="샷 조작"
          data-view={view}
          data-angle={angle.toFixed(1)}
          data-elevation={elevation}
          data-spin-x={spin.x.toFixed(3)}
          data-spin-y={spin.y.toFixed(3)}
          data-stroke={stroke}
          data-power={power}
        >
          <button className="rail-view-toggle" onClick={() => view === 'aim' ? setView('overview') : enterPlayerView()} disabled={shooting || lives <= 0}>
            <Eye />
            <span>{view === 'aim' ? '테이블' : '선수뷰'}</span>
          </button>

          <CueElevationControl
            value={elevation}
            max={PHYSICS.maximumCueElevation}
            disabled={shooting}
            onChange={setElevation}
          />

          <div className="rail-strokes" role="group" aria-label="스트로크 선택">
            <small>스트로크</small>
            {strokeOptions.map((option) => (
              <button
                key={option.id}
                className={`${option.id} ${stroke === option.id ? 'active' : ''}`}
                onClick={() => selectStroke(option.id)}
                disabled={shooting}
                aria-label={`${option.label}, ${option.detail}`}
                aria-pressed={stroke === option.id}
              >
                <i /><span>{option.id === 'push' ? '밀기' : option.id === 'punch' ? '끊기' : '기본'}</span>
              </button>
            ))}
          </div>

          <div className="rail-cue-control">
            <span className="rail-power"><small>세기</small><strong>{power}</strong></span>
            <button
              className="rail-cue-pull"
              onPointerDown={beginCuePull}
              onPointerMove={moveCuePull}
              onPointerUp={(event) => endCuePull(event)}
              onPointerCancel={(event) => endCuePull(event, true)}
              onKeyDown={keyCuePull}
              disabled={view !== 'aim' || shooting || lives <= 0}
              role="slider"
              aria-orientation="vertical"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={power}
              aria-valuetext={`세기 ${power}. 방향키로 조절하고 Enter로 치기`}
              aria-label="큐를 아래로 당겼다가 놓아 치기"
            >
              <span className="rail-cue-shaft" style={{ '--cue-offset': `${cuePull * cueTravel}px` } as CSSProperties}><i /></span>
              <span className="rail-cue-guide" />
              <span className="rail-cue-scale" aria-hidden="true"><i>0</i><i>50</i><i>100</i></span>
              <ChevronsDown className="rail-cue-arrow" />
            </button>
            <small>{shooting ? '진행 중' : view === 'aim' ? cuePulling ? '놓으면 샷' : '당겼다 놓기' : '테이블 터치'}</small>
          </div>
        </aside>
      </section>

      {finished && (
        <GameResultDialog
          titleId="result-title"
          score={score}
          message="5개의 목숨을 모두 사용했습니다."
          saved={saved}
          onRetrySave={saveFinalScore}
          onRestart={restart}
        />
      )}
    </div>
  )
}
