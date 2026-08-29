import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { GameHeader } from './GameHeader'
import { GameResultDialog } from './GameResultDialog'

describe('shared game chrome', () => {
  it('keeps the game exit, title, ranked state, and primary game status in one header', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <GameHeader title="3쿠션" rankedState="ready"><div>5 lives</div></GameHeader>
      </MemoryRouter>,
    )

    expect(html).toContain('게임 선택 화면으로')
    expect(html).toContain('<h1>3쿠션</h1>')
    expect(html).toContain('>순위</span>')
    expect(html).toContain('5 lives')
    expect(html).not.toContain('RANKED')
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
})
