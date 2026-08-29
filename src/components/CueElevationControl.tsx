import type { CSSProperties, ChangeEvent } from 'react'

interface CueElevationControlProps {
  value: number
  max: number
  disabled: boolean
  onChange: (value: number) => void
}

function elevationName(value: number) {
  if (value < 8) return '낮게'
  if (value < 24) return '세워치기'
  return '마세'
}

export function CueElevationControl({ value, max, disabled, onChange }: CueElevationControlProps) {
  const name = elevationName(value)
  const style = {
    '--cue-elevation': `${-value}deg`,
    '--cue-elevation-progress': `${value / max * 100}%`,
  } as CSSProperties

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(Number(event.target.value))
  }

  return (
    <label className="rail-elevation" style={style}>
      <span className="rail-elevation-heading">
        <small>큐 각도</small>
        <strong>{value}°</strong>
      </span>
      <span className="rail-elevation-preview" aria-hidden="true">
        <i className="rail-elevation-arc" />
        <i className="rail-elevation-ball" />
        <i className="rail-elevation-cue" />
      </span>
      <input
        className="rail-elevation-slider"
        style={{ width: '100%', minWidth: 0, maxWidth: '100%' }}
        type="range"
        min="0"
        max={max}
        step="1"
        value={value}
        onChange={handleChange}
        disabled={disabled}
        aria-label="큐 세우기 각도"
        aria-valuetext={`큐 각도 ${value}도, ${name}`}
      />
      <span className="rail-elevation-scale" aria-hidden="true">
        <i>0°</i>
        <em>{name}</em>
        <i>{max}°</i>
      </span>
    </label>
  )
}
