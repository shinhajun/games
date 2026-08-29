import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

export type RankedState = 'checking' | 'ready' | 'error'

const rankedStateLabel: Record<RankedState, string> = {
  checking: '연결 중',
  ready: '순위',
  error: '재연결',
}

export function GameHeader({
  title,
  rankedState,
  onRetry,
  children,
}: {
  title: string
  rankedState: RankedState
  onRetry?: () => void
  children: ReactNode
}) {
  return (
    <header className="play-header page-wrap">
      <Link to="/" className="back-link" aria-label="게임 선택 화면으로"><ArrowLeft size={17} /><span>게임 선택</span></Link>
      <div className="play-title">
        <h1>{title}</h1>
        {rankedState === 'error' && onRetry
          ? <button type="button" className="ranked-state error" onClick={onRetry} aria-label="순위 서버 재연결">{rankedStateLabel.error}</button>
          : <span className={`ranked-state ${rankedState}`} role="status">{rankedStateLabel[rankedState]}</span>}
      </div>
      {children}
    </header>
  )
}
