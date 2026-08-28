import { useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Crosshair, Eye, Gauge, RotateCcw, Send, Sparkles, Target, X } from 'lucide-react'
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

export function BilliardsPage({ mode }: { mode: BilliardsMode }) {
  const sceneRef = useRef<BilliardsSceneHandle>(null)
  const startedAt = useRef(0)
  const { profile } = useProfile()
  const [sceneKey, setSceneKey] = useState(0)
  const [view, setView] = useState<'overview' | 'aim'>('overview')
  const [angle, setAngle] = useState(10)
  const [power, setPower] = useState(56)
  const [spin, setSpin] = useState<Vec2>({ x: 0, y: 0.1 })
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

  function updateSpin(event: PointerEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width - 0.5) * 2))
    const y = Math.max(-1, Math.min(1, -((event.clientY - rect.top) / rect.height - 0.5) * 2))
    setSpin({ x, y })
  }

  function shoot() {
    if (shooting || attempts >= 6) return
    if (view === 'overview') {
      setView('aim')
      return
    }
    if (startedAt.current === 0) startedAt.current = nowMs()
    sceneRef.current?.shoot({ angle: angle * Math.PI / 180, power, spin, stroke })
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
            onShotStart={() => { setShooting(true); setLastVerdict(null) }}
            onShotLaunched={() => setView('overview')}
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
          <div className="table-hint"><Crosshair size={14} /> {view === 'overview' ? '전체 경로를 읽고 PLAYER VIEW로 전환하세요.' : '조준선을 확인한 뒤 스트로크를 실행하세요.'}</div>
        </div>

        <aside className="shot-panel">
          <div className="panel-heading">
            <span className="eyebrow">SHOT LAB</span>
            <h2>한 큐 설계</h2>
            <button className="icon-button" onClick={() => setView((current) => current === 'aim' ? 'overview' : 'aim')} disabled={shooting} aria-label="시점 전환">
              <Eye size={18} />
            </button>
          </div>

          <section className="control-section aim-control">
            <label><span><Target size={15} /> 조준각</span><strong>{angle > 0 ? '+' : ''}{angle}°</strong></label>
            <div className="range-row">
              <button onClick={() => setAngle((value) => Math.max(-180, value - 2))} aria-label="왼쪽으로 2도"><ChevronLeft /></button>
              <input type="range" min="-180" max="180" value={angle} onChange={(event) => setAngle(Number(event.target.value))} disabled={shooting} />
              <button onClick={() => setAngle((value) => Math.min(180, value + 2))} aria-label="오른쪽으로 2도"><ChevronRight /></button>
            </div>
          </section>

          <section className="control-section spin-control">
            <label><span><Crosshair size={15} /> 당점</span><strong>{Math.abs(spin.x) < 0.08 && Math.abs(spin.y) < 0.08 ? 'CENTER' : `${spin.y >= 0 ? '상' : '하'} ${spin.x >= 0 ? '우' : '좌'}`}</strong></label>
            <div className="spin-layout">
              <button className="cue-ball-control" onPointerDown={updateSpin} onPointerMove={(event) => { if (event.buttons === 1) updateSpin(event) }} disabled={shooting} aria-label="수구 당점 선택">
                <i className="axis axis-x" /><i className="axis axis-y" />
                <span style={{ left: `${50 + spin.x * 38}%`, top: `${50 - spin.y * 38}%` }} />
              </button>
              <div className="spin-legend"><span>밀림</span><div /><span>끌림</span><button onClick={() => setSpin({ x: 0, y: 0 })}>정중앙</button></div>
            </div>
          </section>

          <section className="control-section power-control">
            <label><span><Gauge size={15} /> 세기</span><strong>{power}%</strong></label>
            <input className="power-range" type="range" min="8" max="100" value={power} onChange={(event) => setPower(Number(event.target.value))} disabled={shooting} style={{ '--power': `${power}%` } as CSSProperties} />
            <div className="range-labels"><span>SOFT</span><span>MEDIUM</span><span>HARD</span></div>
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

          <button className={`shoot-button ${view === 'aim' ? 'ready' : ''}`} onClick={shoot} disabled={shooting || attempts >= 6}>
            {shooting ? <><span className="button-loader" /> 공이 멈추는 중</> : view === 'overview' ? <><Eye /> PLAYER VIEW</> : <><Crosshair /> 이 설정으로 치기</>}
          </button>
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
