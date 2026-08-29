import { RotateCcw } from 'lucide-react'
import { Link } from 'react-router-dom'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const saveStateLabel: Record<SaveState, string> = {
  idle: '',
  saving: '기록 저장 중…',
  saved: '최고 기록에 반영했습니다.',
  error: '서버 연결이 없어 로컬에 저장했습니다.',
}

export function GameResultDialog({
  titleId,
  score,
  maxScore,
  message,
  saved,
  onRestart,
  accent = 'green',
}: {
  titleId: string
  score: number
  maxScore?: number
  message: string
  saved: SaveState
  onRestart: () => void
  accent?: 'green' | 'amber'
}) {
  return (
    <div className="result-overlay" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className={`result-card ${accent}`}>
        <h2 className="result-final-score" id={titleId}>
          <em>{score}</em><span>점</span>{maxScore && <small>/ {maxScore}</small>}
        </h2>
        <p>{message}</p>
        <p className={`result-save-state ${saved}`} role="status">{saveStateLabel[saved]}</p>
        <div className="result-actions">
          <button className="primary-button" onClick={onRestart} disabled={saved === 'saving'}><RotateCcw /> 다시 하기</button>
          <Link className="text-button" to="/leaderboard">전체 순위</Link>
        </div>
      </div>
    </div>
  )
}
