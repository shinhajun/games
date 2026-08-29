import { useCallback, useEffect, useRef, useState } from 'react'
import { CloudOff, Medal, RefreshCw, Trophy } from 'lucide-react'
import { getLeaderboard } from '../lib/leaderboard'
import { GAME_META, type GameCode, type LeaderboardEntry } from '../types'
import { scoreUnit } from './leaderboardFormat'

function formatDuration(ms: number) {
  const seconds = Math.round(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function Leaderboard({ game, compact = false }: { game: GameCode; compact?: boolean }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const requestId = useRef(0)

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current
    try {
      const nextEntries = await getLeaderboard(game, compact ? 5 : 20)
      if (currentRequest !== requestId.current) return
      setEntries(nextEntries)
      setFailed(false)
    } catch {
      if (currentRequest !== requestId.current) return
      setEntries([])
      setFailed(true)
    } finally {
      if (currentRequest === requestId.current) setLoading(false)
    }
  }, [compact, game])

  function refresh() {
    setLoading(true)
    setFailed(false)
    void load()
  }

  useEffect(() => {
    const currentRequest = ++requestId.current
    void getLeaderboard(game, compact ? 5 : 20)
      .then((nextEntries) => {
        if (currentRequest !== requestId.current) return
        setEntries(nextEntries)
        setFailed(false)
      })
      .catch(() => {
        if (currentRequest !== requestId.current) return
        setEntries([])
        setFailed(true)
      })
      .finally(() => {
        if (currentRequest === requestId.current) setLoading(false)
      })
    return () => { requestId.current += 1 }
  }, [compact, game])

  return (
    <section className={`leaderboard-card ${compact ? 'compact' : ''}`}>
      <header>
        <div>
          <span className="eyebrow"><Trophy size={13} /> {GAME_META[game].eyebrow}</span>
          <h2>{compact ? 'TOP PLAYERS' : `${GAME_META[game].label} 순위`}</h2>
        </div>
        <button className="icon-button" onClick={refresh} aria-label="순위 새로고침"><RefreshCw size={17} className={loading ? 'spin' : ''} /></button>
      </header>
      <ol className="score-list">
        {!loading && failed && (
          <li className="error-score"><CloudOff size={19} /> 순위 서버 연결에 실패했습니다.</li>
        )}
        {!loading && !failed && entries.length === 0 && (
          <li className="empty-score"><Medal size={19} /> 첫 기록의 주인공이 되어보세요.</li>
        )}
        {entries.map((entry, index) => (
          <li key={`${entry.playerId}-${entry.game}`}>
            <span className={`rank rank-${index + 1}`}>{index + 1}</span>
            <span className="rank-avatar">{entry.name.slice(0, 1)}</span>
            <span className="rank-name">{entry.name}<small>{entry.playedCount} PLAY{entry.playedCount > 1 ? 'S' : ''}</small></span>
            <strong>{entry.score}<small>{scoreUnit(game)}</small></strong>
            {!compact && <time>{formatDuration(entry.durationMs)}</time>}
          </li>
        ))}
      </ol>
    </section>
  )
}
