import { useRef, useState, type CSSProperties, type PointerEvent, type WheelEvent } from 'react'
import { ArrowLeft, Check, ChevronsDown, Crosshair, Eye, MoveHorizontal, RotateCcw, Sparkles, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useProfile } from '../useProfile'
import { Leaderboard } from '../components/Leaderboard'
import {
  BilliardsScene,
  type BilliardsSceneHandle,
  type StrokeStyle,
} from '../game/billiards/BilliardsScene'
import { getTableSpec, type BilliardsMode, type ShotVerdict, type Vec2 } from '../game/billiards/engine'
import { submitScore } from '../lib/leaderboard'
import { nowMs } from '../lib/time'

const copy = {
  'three-cushion': {
    eyebrow: 'THREE CUSHION · 6 SHOT CHALLENGE',
    title: '3쿠션',
    description: '수구로 두 목적구를 맞히되, 두 번째 목적구 전에 쿠션을 3회 이상 맞히면 득점합니다.',
    tip: '목적구를 먼저 맞혀도, 쿠션을 먼저 맞혀도 됩니다. 중요한 건 두 번째 목적구 전 3쿠션입니다.',
  },
  'four-ball': {
    eyebrow: 'FOUR BALL · 6 SHOT CHALLENGE',
    title: '4구',
    description: '흰 수구로 빨간 공 2개를 모두 맞히면 득점. 노란 상대 수구를 맞히면 파울입니다.',
    tip: '쿠션 횟수는 자유입니다. 노란 공을 피하면서 두 빨간 공의 연결선을 설계하세요.',
  },
} as const

const strokeOptions: { id: StrokeStyle; label: string; detail: string }[] = [
  { id: 'push', label: '밀어치기', detail: '긴 팔로우' },
  { id: 'normal', label: '기본', detail: '균형' },
  { id: 'punch', label: '끊어치기', detail: '짧고 강하게' },
]

interface AimGesture {
  pointerId: number
  startX: number
  startAngle: number
}

interface CuePullGesture {
  pointerId: number
  startY: number
  pull: number
}

function normalizeAngle(value: number) {
  return ((value + 180) % 360 + 360) % 360 - 180
}

export function BilliardsPage({ mode }: { mode: BilliardsMode }) {
  const sceneRef = useRef<BilliardsSceneHandle>(null)
  const startedAt = useRef(0)
  const angleRef = useRef(10)
  const gestureRef = useRef<AimGesture | null>(null)
  const cuePullRef = useRef<CuePullGesture | null>(null)
  const { profile } = useProfile()
  const [sceneKey, setSceneKey] = useState(0)
  const [view, setView] = useState<'overview' | 'aim'>('overview')
  const [angle, setAngle] = useState(10)
  const [power, setPower] = useState(8)
  const [cuePull, setCuePull] = useState(0)
  const [cuePulling, setCuePulling] = useState(false)
  const [spin, setSpin] = useState<Vec2>({ x: 0, y: 0 })
  const [stroke, setStroke] = useState<StrokeStyle>('normal')
  const [attempts, setAttempts] = useState(0)
  const [score, setScore] = useState(0)
  const [shotResults, setShotResults] = useState<boolean[]>([])
  const [shooting, setShooting] = useState(false)
  const [lastVerdict, setLastVerdict] = useState<ShotVerdict | null>(null)
  const [finished, setFinished] = useState(false)
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const info = copy[mode]
  const tableSpec = getTableSpec(mode)

  function updateAimAngle(nextAngle: number) {
    const normalized = normalizeAngle(nextAngle)
    angleRef.current = normalized
    setAngle(normalized)
  }

  function updateCuePull(pull: number) {
    const normalized = Math.max(0, Math.min(1, pull))
    setCuePull(normalized)
    setPower(Math.round(8 + normalized * 92))
  }

  function enterPlayerView(nextAngle = angleRef.current) {
    updateAimAngle(nextAngle)
    updateCuePull(0)
    setLastVerdict(null)
    setView('aim')
  }

  function launchPulledShot(pull: number) {
    if (shooting || attempts >= 6 || pull < 0.08) {
      updateCuePull(0)
      return
    }
    const shotPower = Math.round(8 + pull * 92)
    if (startedAt.current === 0) startedAt.current = nowMs()
    const launched = sceneRef.current?.shoot({ angle: angleRef.current * Math.PI / 180, power: shotPower, spin, stroke }, pull) ?? false
    if (launched) {
      setPower(shotPower)
      setCuePull(0)
    }
  }

  function beginAimGesture(event: PointerEvent<HTMLDivElement>) {
    if (view !== 'aim' || shooting || attempts >= 6) return
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
    if (view !== 'aim' || shooting || attempts >= 6) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    cuePullRef.current = { pointerId: event.pointerId, startY: event.clientY, pull: 0 }
    setCuePulling(true)
    updateCuePull(0)
  }

  function moveCuePull(event: PointerEvent<HTMLButtonElement>) {
    const gesture = cuePullRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const maxPull = Math.max(82, Math.min(150, event.currentTarget.clientHeight * 0.48))
    gesture.pull = Math.max(0, Math.min(1, (event.clientY - gesture.startY) / maxPull))
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
    else launchPulledShot(gesture.pull)
  }

  function wheelAim(event: WheelEvent<HTMLDivElement>) {
    if (view !== 'aim' || shooting) return
    event.preventDefault()
    const movement = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    updateAimAngle(angleRef.current + movement * 0.045)
  }

  function finishRun(finalScore: number) {
    setFinished(true)
    if (!profile) return
    setSaved('saving')
    void submitScore(profile, { game: mode, score: finalScore, durationMs: nowMs() - startedAt.current })
      .then(() => setSaved('saved'))
      .catch(() => setSaved('error'))
  }

  function restart() {
    startedAt.current = 0
    setSceneKey((key) => key + 1)
    setView('overview')
    updateAimAngle(10)
    updateCuePull(0)
    setCuePulling(false)
    setAttempts(0)
    setScore(0)
    setShotResults([])
    setShooting(false)
    setLastVerdict(null)
    setFinished(false)
    setSaved('idle')
  }

  return (
    <div className="play-page billiards-page">
      <header className="play-header page-wrap">
        <Link to="/" className="back-link"><ArrowLeft size={17} /> 게임 선택</Link>
        <div className="play-title">
          <span className="eyebrow">{info.eyebrow}</span>
          <h1>{info.title}</h1>
        </div>
        <div className="shot-score" aria-label={`현재 점수 ${score}점, ${attempts}번 시도`}>
          <span><small>SCORE</small><strong>{score}</strong></span>
          <div className="attempt-dots">
            {Array.from({ length: 6 }, (_, index) => (
              <i key={index} className={shotResults[index] === true ? 'success' : shotResults[index] === false ? 'used' : ''}>{index + 1}</i>
            ))}
          </div>
          <span><small>SHOTS</small><strong>{attempts}<em>/6</em></strong></span>
        </div>
      </header>

      <section className="billiards-layout">
        <div className="table-stage">
          <BilliardsScene
            key={`${mode}-${sceneKey}`}
            ref={sceneRef}
            mode={mode}
            view={view}
            angle={angle * Math.PI / 180}
            spin={spin}
            manualPull={cuePull}
            onAimSelected={(nextAngle) => enterPlayerView(nextAngle * 180 / Math.PI)}
            onSpinSelected={setSpin}
            onShotStart={() => { setShooting(true); setLastVerdict(null) }}
            onShotLaunched={() => { setCuePull(0); setCuePulling(false); setView('overview') }}
            onShotEnd={(verdict) => {
              const nextAttempts = attempts + 1
              const nextScore = score + (verdict.success ? 1 : 0)
              setLastVerdict(verdict)
              setAttempts(nextAttempts)
              setScore(nextScore)
              setShotResults((results) => [...results, verdict.success])
              setShooting(false)
              if (nextAttempts >= 6) window.setTimeout(() => finishRun(nextScore), 700)
            }}
          />
          {view === 'aim' && !shooting && attempts < 6 && (
            <div
              className="shot-gesture-layer"
              onPointerDown={beginAimGesture}
              onPointerMove={moveAimGesture}
              onPointerUp={(event) => endAimGesture(event)}
              onPointerCancel={(event) => endAimGesture(event)}
              onWheel={wheelAim}
              role="application"
              aria-label="화면을 좌우로 밀어 조준"
            >
              <div className="aim-swipe-hint"><MoveHorizontal /> 좌우로 밀어 조준</div>
            </div>
          )}
          <div className={`view-badge ${view}`}><Eye size={14} /> {view === 'aim' ? 'PLAYER VIEW' : 'TABLE VIEW'}</div>
          <div className="table-spec-badge">
            {tableSpec.label} · {Math.round(tableSpec.playingLength * 1000)}×{Math.round(tableSpec.playingWidth * 1000)}mm · Ø{(tableSpec.ballDiameter * 1000).toFixed(1)}mm · {Math.round(tableSpec.ballMass * 1000)}g
          </div>
          {lastVerdict && (
            <div className={`shot-verdict ${lastVerdict.success ? 'success' : 'miss'}`}>
              <span>{lastVerdict.success ? <Check /> : <X />}</span>
              <div><strong>{lastVerdict.title}</strong><small>{lastVerdict.detail}</small></div>
            </div>
          )}
          <div className="table-hint"><Crosshair size={14} /> {view === 'overview' ? '테이블 위에서 보낼 지점을 터치하세요.' : '좌우로 조준 · 오른쪽 큐를 당겼다가 놓아 샷'}</div>
        </div>

        <aside
          className={`shot-rail ${view} ${cuePulling ? 'pulling' : ''}`}
          aria-label="샷 조작"
          data-view={view}
          data-angle={angle.toFixed(1)}
          data-stroke={stroke}
          data-power={power}
        >
          <button className="rail-view-toggle" onClick={() => view === 'aim' ? setView('overview') : enterPlayerView()} disabled={shooting || attempts >= 6}>
            <Eye />
            <span>{view === 'aim' ? '테이블' : '선수뷰'}</span>
          </button>

          <div className="rail-strokes" role="group" aria-label="스트로크 선택">
            <small>STROKE</small>
            {strokeOptions.map((option) => (
              <button
                key={option.id}
                className={`${option.id} ${stroke === option.id ? 'active' : ''}`}
                onClick={() => setStroke(option.id)}
                disabled={shooting}
                aria-label={`${option.label}, ${option.detail}`}
              >
                <i /><span>{option.id === 'push' ? '밀기' : option.id === 'punch' ? '끊기' : '기본'}</span>
              </button>
            ))}
          </div>

          <div className="rail-cue-control">
            <span className="rail-power"><small>POWER</small><strong>{power}</strong></span>
            <button
              className="rail-cue-pull"
              onPointerDown={beginCuePull}
              onPointerMove={moveCuePull}
              onPointerUp={(event) => endCuePull(event)}
              onPointerCancel={(event) => endCuePull(event, true)}
              disabled={view !== 'aim' || shooting || attempts >= 6}
              aria-label="큐를 아래로 당겼다가 놓아 치기"
            >
              <span className="rail-cue-shaft" style={{ '--cue-pull': cuePull } as CSSProperties}><i /></span>
              <span className="rail-cue-guide" />
              <ChevronsDown className="rail-cue-arrow" />
            </button>
            <small>{shooting ? '진행 중' : view === 'aim' ? cuePulling ? '놓으면 샷' : '당겼다 놓기' : '테이블 터치'}</small>
          </div>
        </aside>
      </section>

      <section className="rule-strip page-wrap">
        <span className="rule-index">RULE / 01</span>
        <div><strong>{info.description}</strong><p>{info.tip}</p></div>
        <span className="rule-balls" aria-hidden="true"><i /><i /><i />{mode === 'four-ball' && <i />}</span>
      </section>

      {finished && (
        <div className="result-overlay" role="dialog" aria-modal="true" aria-labelledby="result-title">
          <div className="result-card">
            <span className="result-spark"><Sparkles /></span>
            <span className="eyebrow">CHALLENGE COMPLETE</span>
            <h2 id="result-title">6번의 샷,<br /><em>{score}번의 득점.</em></h2>
            <p>{score >= 5 ? '테이블을 완전히 읽으셨군요.' : score >= 3 ? '좋은 감각입니다. 다음 기록은 더 높을 거예요.' : '각도는 매번 새롭게 보입니다. 다시 읽어보세요.'}</p>
            <div className="result-score"><small>FINAL SCORE</small><strong>{score}<span>/6</span></strong><small>{saved === 'saving' ? '기록 저장 중…' : saved === 'saved' ? '최고 기록 반영 완료' : saved === 'error' ? '로컬 기록 저장 완료' : ''}</small></div>
            <div className="result-actions">
              <button className="primary-button" onClick={restart}><RotateCcw /> 다시 도전</button>
              <Link className="text-button" to="/leaderboard">전체 순위 보기</Link>
            </div>
            <Leaderboard key={saved} game={mode} compact />
          </div>
        </div>
      )}
    </div>
  )
}
