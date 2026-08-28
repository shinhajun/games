import { useRef, useState, type CSSProperties, type PointerEvent, type WheelEvent } from 'react'
import { ArrowLeft, Check, ChevronLeft, ChevronRight, ChevronsDown, Crosshair, Eye, Gauge, MoveHorizontal, RotateCcw, Send, SlidersHorizontal, Sparkles, Target, X } from 'lucide-react'
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
  startY: number
  startAngle: number
  mode: 'pending' | 'aim' | 'pull'
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
  const { profile } = useProfile()
  const [sceneKey, setSceneKey] = useState(0)
  const [view, setView] = useState<'overview' | 'aim'>('overview')
  const [panelOpen, setPanelOpen] = useState(false)
  const [angle, setAngle] = useState(10)
  const [power, setPower] = useState(8)
  const [cuePull, setCuePull] = useState(0)
  const [gestureMode, setGestureMode] = useState<AimGesture['mode'] | 'idle'>('idle')
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
    setGestureMode('idle')
    setLastVerdict(null)
    setPanelOpen(false)
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
      startY: event.clientY,
      startAngle: angleRef.current,
      mode: 'pending',
      pull: 0,
    }
    setGestureMode('pending')
  }

  function moveAimGesture(event: PointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    event.preventDefault()
    const dx = event.clientX - gesture.startX
    const dy = event.clientY - gesture.startY

    if (gesture.mode === 'pending') {
      if (Math.hypot(dx, dy) < 7) return
      gesture.mode = Math.abs(dx) > Math.abs(dy) * 1.08 ? 'aim' : 'pull'
      setGestureMode(gesture.mode)
    }

    if (gesture.mode === 'aim') {
      updateAimAngle(gesture.startAngle + dx / Math.max(event.currentTarget.clientWidth, 1) * 120)
      return
    }

    const maxPull = Math.max(115, Math.min(220, event.currentTarget.clientHeight * 0.34))
    gesture.pull = Math.max(0, Math.min(1, dy / maxPull))
    updateCuePull(gesture.pull)
  }

  function endAimGesture(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    gestureRef.current = null
    setGestureMode('idle')
    if (gesture.mode === 'pull' && !cancelled) launchPulledShot(gesture.pull)
    else if (gesture.mode === 'pull') updateCuePull(0)
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
    setPanelOpen(false)
    updateAimAngle(10)
    updateCuePull(0)
    setGestureMode('idle')
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
            onShotLaunched={() => { updateCuePull(0); setPanelOpen(false); setView('overview') }}
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
              className={`shot-gesture-layer ${gestureMode}`}
              onPointerDown={beginAimGesture}
              onPointerMove={moveAimGesture}
              onPointerUp={(event) => endAimGesture(event)}
              onPointerCancel={(event) => endAimGesture(event, true)}
              onWheel={wheelAim}
              role="application"
              aria-label="좌우로 밀어 조준하고 아래로 큐를 당겼다가 놓아 샷"
            >
              <div className="aim-swipe-hint"><MoveHorizontal /> 좌우로 밀어 조준</div>
              <div className="cue-pull-indicator" style={{ transform: `translate(-50%, ${cuePull * 46}px)` } as CSSProperties}>
                <span><ChevronsDown /> {gestureMode === 'pull' ? `${power}% · 놓으면 샷` : '아래로 당겨 세기 조절'}</span>
                <i />
              </div>
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
          <div className="table-hint"><Crosshair size={14} /> {view === 'overview' ? '테이블 위에서 보낼 지점을 터치하세요.' : '좌우로 밀어 조준 · 큐를 아래로 당겼다가 놓아 샷'}</div>
        </div>

        <button
          className={`mobile-controls-toggle ${panelOpen ? 'panel-open' : ''}`}
          onClick={() => setPanelOpen(true)}
          aria-expanded={panelOpen}
          aria-controls="shot-controls"
        >
          <SlidersHorizontal />
          <span>샷 설정</span>
        </button>
        <button
          className={`mobile-panel-scrim ${panelOpen ? 'open' : ''}`}
          onClick={() => setPanelOpen(false)}
          aria-label="샷 설정 닫기"
          tabIndex={panelOpen ? 0 : -1}
        />

        <aside id="shot-controls" className={`shot-panel ${panelOpen ? 'open' : ''}`}>
          <div className="panel-heading">
            <span className="eyebrow">SHOT LAB</span>
            <h2>한 큐 설계</h2>
            <div className="panel-actions">
              <button className="icon-button" onClick={() => view === 'aim' ? setView('overview') : enterPlayerView()} disabled={shooting} aria-label="시점 전환">
                <Eye size={18} />
              </button>
              <button className="icon-button mobile-panel-close" onClick={() => setPanelOpen(false)} aria-label="샷 설정 닫기">
                <X size={18} />
              </button>
            </div>
          </div>

          <section className="control-section aim-control">
            <label><span><Target size={15} /> 조준각</span><strong>{angle > 0 ? '+' : ''}{angle.toFixed(1)}°</strong></label>
            <div className="aim-swipe-control">
              <button onClick={() => updateAimAngle(angleRef.current - 2)} aria-label="왼쪽으로 2도"><ChevronLeft /></button>
              <span><MoveHorizontal /> 화면을 좌우로 밀어 미세 조준</span>
              <button onClick={() => updateAimAngle(angleRef.current + 2)} aria-label="오른쪽으로 2도"><ChevronRight /></button>
            </div>
          </section>

          <section className="control-section spin-control">
            <label><span><Crosshair size={15} /> 당점</span><strong>{Math.abs(spin.x) < 0.08 && Math.abs(spin.y) < 0.08 ? 'CENTER' : `${spin.y >= 0 ? '상' : '하'} ${spin.x >= 0 ? '우' : '좌'}`}</strong></label>
            <div className="spin-status">
              <span className="spin-status-ball" aria-hidden="true">
                <i className="axis axis-x" /><i className="axis axis-y" />
                <b style={{ left: `${50 + spin.x * 34}%`, top: `${50 - spin.y * 34}%` }} />
              </span>
              <p><strong>PLAYER VIEW</strong>의 실제 수구 위에서 당점을 드래그하세요.</p>
              <button onClick={() => setSpin({ x: 0, y: 0 })} disabled={shooting}>정중앙</button>
            </div>
          </section>

          <section className="control-section power-control">
            <label><span><Gauge size={15} /> 세기</span><strong>{power}%</strong></label>
            <div className="pull-power-meter"><i style={{ width: `${power}%` }} /></div>
            <div className="range-labels"><span>SOFT</span><span>MEDIUM</span><span>HARD</span></div>
            <p className="pull-power-copy"><ChevronsDown /> PLAYER VIEW에서 큐를 아래로 당긴 거리로 결정됩니다.</p>
          </section>

          <section className="control-section stroke-control">
            <label><span><Send size={15} /> 스트로크</span></label>
            <div className="stroke-options">
              {strokeOptions.map((option) => (
                <button key={option.id} className={stroke === option.id ? 'active' : ''} onClick={() => setStroke(option.id)} disabled={shooting}>
                  <strong>{option.label}</strong><small>{option.detail}</small>
                </button>
              ))}
            </div>
          </section>

          {shooting ? (
            <div className="shoot-button"><span className="button-loader" /> 공이 멈추는 중</div>
          ) : view === 'overview' ? (
            <button className="shoot-button" onClick={() => enterPlayerView()} disabled={attempts >= 6}><Eye /> 현재 각도로 PLAYER VIEW</button>
          ) : (
            <div className="pull-shot-guide"><MoveHorizontal /> 좌우 조준 <span /> <ChevronsDown /> 당겼다가 놓아 치기</div>
          )}
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
