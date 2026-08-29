import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

export type RankedState = 'checking' | 'ready' | 'local'

const rankedStateLabel: Record<RankedState, string> = {
  checking: '연결 중',
  ready: '순위',
  local: '로컬',
}

export function GameHeader({
  title,
  rankedState,
  children,
}: {
  title: string
  rankedState: RankedState
  children: ReactNode
}) {
  return (
    <header className="play-header page-wrap">
      <Link to="/" className="back-link" aria-label="게임 선택 화면으로"><ArrowLeft size={17} /><span>게임 선택</span></Link>
      <div className="play-title">
        <h1>{title}</h1>
        <span className={`ranked-state ${rankedState}`} role="status">{rankedStateLabel[rankedState]}</span>
      </div>
      {children}
    </header>
  )
}
