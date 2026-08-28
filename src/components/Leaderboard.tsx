import { useCallback, useEffect, useState } from 'react'
import { Medal, RefreshCw, Trophy } from 'lucide-react'
import { getLeaderboard } from '../lib/leaderboard'
import { GAME_META, type GameCode, type LeaderboardEntry } from '../types'

function formatDuration(ms: number) {
  const seconds = Math.round(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function Leaderboard({ game, compact = false }: { game: GameCode; compact?: boolean }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setEntries(await getLeaderboard(game, compact ? 5 : 20))
    setLoading(false)
  }, [compact, game])

  useEffect(() => {
    let cancelled = false
    void getLeaderboard(game, compact ? 5 : 20).then((nextEntries) => {
      if (cancelled) return
      setEntries(nextEntries)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [compact, game])

  return (
    <section className={`leaderboard-card ${compact ? 'compact' : ''}`}>
      <header>
        <div>
          <span className="eyebrow"><Trophy size={13} /> {GAME_META[game].eyebrow}</span>
          <h2>{compact ? 'TOP PLAYERS' : `${GAME_META[game].label} 순위`}</h2>
        </div>
        <button className="icon-button" onClick={() => void load()} aria-label="순위 새로고침"><RefreshCw size={17} className={loading ? 'spin' : ''} /></button>
      </header>
      <ol className="score-list">
        {!loading && entries.length === 0 && (
          <li className="empty-score"><Medal size={19} /> 첫 기록의 주인공이 되어보세요.</li>
        )}
        {entries.map((entry, index) => (
          <li key={`${entry.playerId}-${entry.game}`}>
            <span className={`rank rank-${index + 1}`}>{index + 1}</span>
            <span className="rank-avatar">{entry.name.slice(0, 1)}</span>
            <span className="rank-name">{entry.name}<small>{entry.playedCount} PLAY{entry.playedCount > 1 ? 'S' : ''}</small></span>
            <strong>{entry.score}<small>{game === 'yacht' ? ' PTS' : ' / 6'}</small></strong>
            {!compact && <time>{formatDuration(entry.durationMs)}</time>}
          </li>
        ))}
      </ol>
    </section>
  )
}
