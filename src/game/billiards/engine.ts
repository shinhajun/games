export type BilliardsMode = 'three-cushion' | 'four-ball'
export type BallId = 'cue' | 'yellow' | 'red' | 'red2'

export interface Vec2 {
  x: number
  y: number
}

export interface BallState {
  id: BallId
  position: Vec2
  velocity: Vec2
  spin: Vec2
  color: string
}

export type ShotEvent =
  | { type: 'cushion'; rail: 'left' | 'right' | 'top' | 'bottom' }
  | { type: 'ball'; target: Exclude<BallId, 'cue'> }

export interface ShotVerdict {
  success: boolean
  title: string
  detail: string
  cushions: number
  contacts: Exclude<BallId, 'cue'>[]
}

export const TABLE = { halfWidth: 5, halfHeight: 2.5, ballRadius: 0.19 }

export function createInitialBalls(mode: BilliardsMode): BallState[] {
  const balls: BallState[] = [
    { id: 'cue', position: { x: -3.15, y: 0.72 }, velocity: { x: 0, y: 0 }, spin: { x: 0, y: 0 }, color: '#f7f3e8' },
    { id: 'yellow', position: { x: 3.15, y: -0.72 }, velocity: { x: 0, y: 0 }, spin: { x: 0, y: 0 }, color: '#f4c94d' },
    { id: 'red', position: { x: 0.35, y: 0.16 }, velocity: { x: 0, y: 0 }, spin: { x: 0, y: 0 }, color: '#d94236' },
  ]
  if (mode === 'four-ball') {
    balls.push({ id: 'red2', position: { x: 2.05, y: 1.26 }, velocity: { x: 0, y: 0 }, spin: { x: 0, y: 0 }, color: '#e65848' })
  }
  return balls
}

export function evaluateShot(mode: BilliardsMode, events: ShotEvent[]): ShotVerdict {
  const contacts = events
    .filter((event): event is Extract<ShotEvent, { type: 'ball' }> => event.type === 'ball')
    .map((event) => event.target)
  const uniqueContacts = [...new Set(contacts)]

  if (mode === 'four-ball') {
    const foul = uniqueContacts.includes('yellow')
    const success = uniqueContacts.includes('red') && uniqueContacts.includes('red2') && !foul
    return {
      success,
      title: success ? '득점!' : foul ? '상대 수구 접촉' : '아쉽게 빗나갔어요',
      detail: success
        ? '두 적구를 모두 맞혔습니다.'
        : foul
          ? '노란 공은 상대 수구라 맞히면 파울입니다.'
          : '한 번의 샷으로 빨간 공 2개를 모두 맞혀야 합니다.',
      cushions: events.filter((event) => event.type === 'cushion').length,
      contacts: uniqueContacts,
    }
  }

  const needed = new Set<BallId>(['yellow', 'red'])
  let secondObjectEventIndex = -1
  const hit = new Set<BallId>()
  events.forEach((event, index) => {
    if (event.type !== 'ball' || !needed.has(event.target) || secondObjectEventIndex >= 0) return
    hit.add(event.target)
    if (hit.size === 2) secondObjectEventIndex = index
  })
  const cushionCount = secondObjectEventIndex < 0
    ? events.filter((event) => event.type === 'cushion').length
    : events.slice(0, secondObjectEventIndex).filter((event) => event.type === 'cushion').length
  const success = secondObjectEventIndex >= 0 && cushionCount >= 3

  return {
    success,
    title: success ? '3쿠션 성공!' : hit.size < 2 ? '두 번째 공을 놓쳤어요' : '쿠션이 부족해요',
    detail: success
      ? `두 번째 목적구 전에 쿠션 ${cushionCount}회를 채웠습니다.`
      : hit.size < 2
        ? '수구가 노란 공과 빨간 공을 모두 맞혀야 합니다.'
        : `두 번째 목적구 전 쿠션 ${cushionCount}회 — 최소 3회가 필요합니다.`,
    cushions: cushionCount,
    contacts: uniqueContacts,
  }
}

function dot(a: Vec2, b: Vec2) {
  return a.x * b.x + a.y * b.y
}

export function applyShot(ball: BallState, angle: number, power: number, spin: Vec2, stroke: 'push' | 'normal' | 'punch') {
  const strokePower = stroke === 'punch' ? 1.08 : stroke === 'push' ? 0.92 : 1
  const speed = (2.8 + power * 0.075) * strokePower
  ball.velocity = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed }
  ball.spin = {
    x: spin.x * (stroke === 'push' ? 1.12 : stroke === 'punch' ? 0.7 : 1),
    y: spin.y * (stroke === 'push' ? 1.15 : stroke === 'punch' ? 0.72 : 1),
  }
}

export function areBallsStopped(balls: BallState[]) {
  return balls.every((ball) => Math.hypot(ball.velocity.x, ball.velocity.y) < 0.035)
}

export function stepPhysics(balls: BallState[], delta: number, onEvent: (event: ShotEvent) => void) {
  const dt = Math.min(delta, 1 / 30)
  const radius = TABLE.ballRadius
  const xLimit = TABLE.halfWidth - radius
  const yLimit = TABLE.halfHeight - radius

  for (const ball of balls) {
    const speed = Math.hypot(ball.velocity.x, ball.velocity.y)
    if (speed > 0.02 && ball.id === 'cue' && Math.abs(ball.spin.x) > 0.01) {
      const curve = ball.spin.x * 0.16 * dt * Math.min(speed / 6, 1)
      const cos = Math.cos(curve)
      const sin = Math.sin(curve)
      const { x, y } = ball.velocity
      ball.velocity = { x: x * cos - y * sin, y: x * sin + y * cos }
    }

    ball.position.x += ball.velocity.x * dt
    ball.position.y += ball.velocity.y * dt

    if (ball.position.x > xLimit) {
      ball.position.x = xLimit
      if (ball.velocity.x > 0) {
        ball.velocity.x *= -0.91
        ball.velocity.y += ball.spin.x * 0.17
        if (ball.id === 'cue') onEvent({ type: 'cushion', rail: 'right' })
      }
    } else if (ball.position.x < -xLimit) {
      ball.position.x = -xLimit
      if (ball.velocity.x < 0) {
        ball.velocity.x *= -0.91
        ball.velocity.y -= ball.spin.x * 0.17
        if (ball.id === 'cue') onEvent({ type: 'cushion', rail: 'left' })
      }
    }

    if (ball.position.y > yLimit) {
      ball.position.y = yLimit
      if (ball.velocity.y > 0) {
        ball.velocity.y *= -0.91
        ball.velocity.x -= ball.spin.x * 0.17
        if (ball.id === 'cue') onEvent({ type: 'cushion', rail: 'top' })
      }
    } else if (ball.position.y < -yLimit) {
      ball.position.y = -yLimit
      if (ball.velocity.y < 0) {
        ball.velocity.y *= -0.91
        ball.velocity.x += ball.spin.x * 0.17
        if (ball.id === 'cue') onEvent({ type: 'cushion', rail: 'bottom' })
      }
    }
  }

  for (let i = 0; i < balls.length; i += 1) {
    for (let j = i + 1; j < balls.length; j += 1) {
      const a = balls[i]
      const b = balls[j]
      const dx = b.position.x - a.position.x
      const dy = b.position.y - a.position.y
      const distance = Math.hypot(dx, dy)
      const minDistance = radius * 2
      if (distance <= 0 || distance >= minDistance) continue

      const normal = { x: dx / distance, y: dy / distance }
      const overlap = minDistance - distance
      a.position.x -= normal.x * overlap * 0.5
      a.position.y -= normal.y * overlap * 0.5
      b.position.x += normal.x * overlap * 0.5
      b.position.y += normal.y * overlap * 0.5

      const relative = { x: a.velocity.x - b.velocity.x, y: a.velocity.y - b.velocity.y }
      const closingSpeed = dot(relative, normal)
      if (closingSpeed <= 0) continue

      const impulse = closingSpeed * 0.97
      a.velocity.x -= impulse * normal.x
      a.velocity.y -= impulse * normal.y
      b.velocity.x += impulse * normal.x
      b.velocity.y += impulse * normal.y

      if (a.id === 'cue') {
        onEvent({ type: 'ball', target: b.id as Exclude<BallId, 'cue'> })
        a.velocity.x += normal.x * a.spin.y * 0.65
        a.velocity.y += normal.y * a.spin.y * 0.65
      } else if (b.id === 'cue') {
        onEvent({ type: 'ball', target: a.id as Exclude<BallId, 'cue'> })
        b.velocity.x -= normal.x * b.spin.y * 0.65
        b.velocity.y -= normal.y * b.spin.y * 0.65
      }
    }
  }

  for (const ball of balls) {
    const damping = Math.exp(-0.78 * dt)
    ball.velocity.x *= damping
    ball.velocity.y *= damping
    ball.spin.x *= Math.exp(-0.42 * dt)
    ball.spin.y *= Math.exp(-0.62 * dt)
    if (Math.hypot(ball.velocity.x, ball.velocity.y) < 0.028) ball.velocity = { x: 0, y: 0 }
  }
}
