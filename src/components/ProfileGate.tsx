import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Dices, Sparkles } from 'lucide-react'
import { useProfile } from '../useProfile'

export function ProfileGate() {
  const { profile, setName } = useProfile()
  const [name, setNameInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!profile) window.setTimeout(() => inputRef.current?.focus(), 300)
  }, [profile])

  if (profile) return null

  return (
    <div className="profile-gate" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="gate-glow gate-glow-one" />
      <div className="gate-glow gate-glow-two" />
      <form
        className="profile-card"
        onSubmit={(event) => {
          event.preventDefault()
          if (name.trim().length >= 2) setName(name)
        }}
      >
        <div className="profile-icon"><Dices size={30} /></div>
        <span className="eyebrow"><Sparkles size={13} /> PLAYER CHECK-IN</span>
        <h1 id="welcome-title">오늘의 이름을<br />기록해 주세요.</h1>
        <p>한 번 입력하면 이 기기에 저장되고, 모든 게임의 최고 기록과 순위표에 사용됩니다.</p>
        <label htmlFor="player-name">플레이어 이름</label>
        <div className="name-field">
          <input
            ref={inputRef}
            id="player-name"
            value={name}
            onChange={(event) => setNameInput(event.target.value.slice(0, 16))}
            placeholder="2–16자"
            minLength={2}
            maxLength={16}
            autoComplete="nickname"
          />
          <button type="submit" disabled={name.trim().length < 2} aria-label="입장">
            <ArrowRight />
          </button>
        </div>
        <small>이름 외의 개인정보는 수집하지 않습니다.</small>
      </form>
    </div>
  )
}
