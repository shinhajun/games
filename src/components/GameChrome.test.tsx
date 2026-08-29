import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { GameHeader } from './GameHeader'
import { GameResultDialog } from './GameResultDialog'

describe('shared game chrome', () => {
  it('keeps only the game exit, title, and primary game status in the game header', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <GameHeader title="3쿠션"><div>5 lives</div></GameHeader>
      </MemoryRouter>,
    )

    expect(html).toContain('게임 선택 화면으로')
    expect(html).toContain('<h1>3쿠션</h1>')
    expect(html).toContain('5 lives')
    expect(html).not.toContain('RANKED')
    expect(html).not.toContain('LIVE')
    expect(html).not.toContain('CONNECT')
    expect(html).not.toContain('RETRY')
    expect(html).not.toContain('재연결')
    expect(html).not.toContain('로컬')
  })

  it('uses one concise result summary without embedding another leaderboard', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <GameResultDialog
          titleId="result-title"
          score={117}
          maxScore={359}
          message="15개 족보를 모두 기록했습니다."
          saved="saved"
          onRestart={() => undefined}
          accent="amber"
        />
      </MemoryRouter>,
    )

    expect(html).toContain('<em>117</em><span>점</span><small>/ 359</small>')
    expect(html).toContain('result-card amber')
    expect(html).toContain('최고 기록에 반영했습니다.')
    expect(html).toContain('다시 하기')
    expect(html).toContain('전체 순위')
    expect(html).not.toContain('leaderboard-card')
    expect(html).not.toContain('FINAL SCORE')
  })

  it('keeps a failed score pending for server retry and never claims a local save', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <GameResultDialog
          titleId="result-title"
          score={12}
          message="게임 종료"
          saved="error"
          onRetrySave={() => undefined}
          onRestart={() => undefined}
        />
      </MemoryRouter>,
    )

    expect(html).toContain('기록 저장에 실패')
    expect(html).toContain('저장 재시도')
    expect(html).not.toContain('로컬')
  })
})
