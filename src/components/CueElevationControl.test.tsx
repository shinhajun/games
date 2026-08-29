import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CueElevationControl } from './CueElevationControl'

describe('cue elevation control', () => {
  it('shows the physical cue angle and keeps the native slider inside a dedicated track', () => {
    const html = renderToStaticMarkup(
      <CueElevationControl value={18} max={45} disabled={false} onChange={() => undefined} />,
    )

    expect(html).toContain('큐 각도')
    expect(html).toContain('18°')
    expect(html).toContain('세워치기')
    expect(html).toContain('rail-elevation-preview')
    expect(html).toContain('rail-elevation-cue')
    expect(html).toContain('rail-elevation-slider')
    expect(html).toContain('aria-valuetext="큐 각도 18도, 세워치기"')
  })

  it('constrains the browser range input to the narrow mobile rail', () => {
    const html = renderToStaticMarkup(
      <CueElevationControl value={5} max={45} disabled={false} onChange={() => undefined} />,
    )

    expect(html).toContain('style="width:100%;min-width:0;max-width:100%"')
  })
})
