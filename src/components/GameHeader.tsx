import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

export function GameHeader({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <header className="play-header page-wrap">
      <Link to="/" className="back-link" aria-label="게임 선택 화면으로"><ArrowLeft size={17} /><span>게임 선택</span></Link>
      <div className="play-title">
        <h1>{title}</h1>
      </div>
      {children}
    </header>
  )
}
