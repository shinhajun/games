import { resolveCushionImpact } from './cushion'

export type BilliardsMode = 'three-cushion' | 'four-ball'
export type BallId = 'cue' | 'yellow' | 'red' | 'red2'

export interface Vec2 {
  x: number
  y: number
}

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface BallState {
  id: BallId
  position: Vec2
  velocity: Vec2
  angularVelocity: Vec3
  color: string
}

export interface TableSpec {
  label: string
  playingLength: number
  playingWidth: number
  ballDiameter: number
  ballMass: number
  cushionNoseHeight: number
  frameWidth: number
  slidingFriction: number
  rollingFriction: number
  sideSpinDeceleration: number
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

export interface ShotEvaluationOptions {
  openingShot?: boolean
}

// Engine units are metres, kilograms, and seconds.
export const TABLE_SPECS: Record<BilliardsMode, TableSpec> = {
  'three-cushion': {
    label: '국제식 대대',
    playingLength: 2.844,
    playingWidth: 1.422,
    ballDiameter: 0.0615,
    ballMass: 0.21,
    cushionNoseHeight: 0.037,
    frameWidth: 0.125,
    slidingFriction: 0.2,
    rollingFriction: 0.008,
    // High-speed tracking measured cloth resistance to stationary side spin at 22 rad/s².
    sideSpinDeceleration: 22,
  },
  'four-ball': {
    label: '국제식 중대',
    playingLength: 2.54,
    playingWidth: 1.27,
    ballDiameter: 0.0655,
    ballMass: 0.255,
    cushionNoseHeight: 0.038,
    frameWidth: 0.12,
    slidingFriction: 0.2,
    rollingFriction: 0.0128,
    sideSpinDeceleration: 22,
  },
}

export const PHYSICS = {
  gravity: 9.80665,
  ballRestitution: 0.98,
  ballFriction: 0.06,
  cushionEnergeticRestitution: 0.98,
  cushionFriction: 0.14,
  stopSpeed: 0.012,
  stopSpin: 0.35,
  maximumTipOffset: 0.7,
  maximumCueElevation: 45,
  minimumShotSpeed: 0.18,
  maximumShotSpeed: 6.2,
  restConfirmationTime: 0.08,
  residualSpinGraceTime: 0.45,
} as const

const CUSHION_PARAMETERS = {
  energeticRestitution: PHYSICS.cushionEnergeticRestitution,
  cushionFriction: PHYSICS.cushionFriction,
}

export function getTableSpec(mode: BilliardsMode) {
  return TABLE_SPECS[mode]
}

function zeroAngularVelocity(): Vec3 {
  return { x: 0, y: 0, z: 0 }
}

export function createInitialBalls(mode: BilliardsMode): BallState[] {
  const spec = getTableSpec(mode)
  const quarterLength = spec.playingLength / 4
  const stationaryBall = (id: BallId, x: number, y: number, color: string): BallState => ({
    id,
    position: { x, y },
    velocity: { x: 0, y: 0 },
    angularVelocity: zeroAngularVelocity(),
    color,
  })

  if (mode === 'four-ball') {
    // Korean four-ball: the opening cue ball sits beside the near red. The far
    // red must be attacked first; the opponent cue ball waits behind it.
    const cueOffset = 0.16
    return [
      stationaryBall('cue', -quarterLength, -cueOffset, '#f7f3e8'),
      stationaryBall('yellow', spec.playingLength * 3 / 8, 0, '#f4c94d'),
      stationaryBall('red', quarterLength, 0, '#d94236'),
      stationaryBall('red2', -quarterLength, 0, '#e65848'),
    ]
  }

  // UMB Scheme A: red on the top spot, opponent cue on the bottom spot,
  // and the opening cue ball on either adjacent starting spot.
  return [
    stationaryBall('cue', -quarterLength, -0.1825, '#f7f3e8'),
    stationaryBall('yellow', -quarterLength, 0, '#f4c94d'),
    stationaryBall('red', quarterLength, 0, '#d94236'),
  ]
}

export function evaluateShot(mode: BilliardsMode, events: ShotEvent[], options: ShotEvaluationOptions = {}): ShotVerdict {
  const contacts = events
    .filter((event): event is Extract<ShotEvent, { type: 'ball' }> => event.type === 'ball')
    .map((event) => event.target)
  const uniqueContacts = [...new Set(contacts)]
  const openingFirstEvent = options.openingShot ? events[0] : undefined
  const invalidOpening = options.openingShot
    && (openingFirstEvent?.type !== 'ball' || openingFirstEvent.target !== 'red')

  if (mode === 'four-ball') {
    const foul = uniqueContacts.includes('yellow')
    const success = uniqueContacts.includes('red') && uniqueContacts.includes('red2') && !foul && !invalidOpening
    return {
      success,
      title: success ? '득점!' : invalidOpening ? '초구 순서 위반' : foul ? '상대 수구 접촉' : '아쉽게 빗나갔어요',
      detail: success
        ? '두 적구를 모두 맞혔습니다.'
        : invalidOpening
          ? '첫 샷은 수구에서 먼 반대편 빨간 공을 직접 먼저 맞혀야 합니다.'
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
  const success = secondObjectEventIndex >= 0 && cushionCount >= 3 && !invalidOpening

  return {
    success,
    title: success ? '3쿠션 성공!' : invalidOpening ? '초구 순서 위반' : hit.size < 2 ? '두 번째 공을 놓쳤어요' : '쿠션이 부족해요',
    detail: success
      ? `두 번째 목적구 전에 쿠션 ${cushionCount}회를 채웠습니다.`
      : invalidOpening
        ? '첫 샷은 빨간 공을 직접 먼저 맞혀야 합니다.'
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

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value))
}

function approachZero(value: number, amount: number) {
  if (Math.abs(value) <= amount) return 0
  return value - Math.sign(value) * amount
}

function cleanNumericalZero(value: number) {
  return Math.abs(value) < 1e-12 ? 0 : value
}

function momentOfInertia(spec: TableSpec) {
  const radius = spec.ballDiameter / 2
  return (2 / 5) * spec.ballMass * radius * radius
}

export type StrokeStyle = 'push' | 'normal' | 'punch'

export interface CueContactGeometry {
  cueDirection: Vec3
  sideDirection: Vec3
  verticalDirection: Vec3
  contactNormal: Vec3
  tipOffset: Vec2
  elevation: number
}

export interface ShotKinematics {
  velocity: Vec2
  angularVelocity: Vec3
  impulse: Vec3
  launchAngle: number
  cueDirection: Vec3
  contactNormal: Vec3
}

export function shotSpeedForPower(power: number, stroke: StrokeStyle) {
  const normalizedPower = clamp(power, 0, 100) / 100
  const speedRange = PHYSICS.maximumShotSpeed - PHYSICS.minimumShotSpeed
  // Stroke labels describe cue delivery, not a hidden force multiplier. At a
  // given displayed power, actual impact speed is identical for every style.
  void stroke
  return PHYSICS.minimumShotSpeed + Math.pow(normalizedPower, 1.6) * speedRange
}

function limitedTipOffset(spin: Vec2) {
  const length = Math.hypot(spin.x, spin.y)
  if (length <= PHYSICS.maximumTipOffset) return spin
  const scale = PHYSICS.maximumTipOffset / length
  return { x: spin.x * scale, y: spin.y * scale }
}

export function cueContactGeometry(angle: number, spin: Vec2, elevationDegrees = 0): CueContactGeometry {
  const tipOffset = limitedTipOffset(spin)
  const elevation = clamp(elevationDegrees, 0, PHYSICS.maximumCueElevation) * Math.PI / 180
  const cosAngle = Math.cos(angle)
  const sinAngle = Math.sin(angle)
  const cosElevation = Math.cos(elevation)
  const sinElevation = Math.sin(elevation)
  const cueDirection = {
    x: cosElevation * cosAngle,
    y: -sinElevation,
    z: cosElevation * sinAngle,
  }
  const sideDirection = { x: -sinAngle, y: 0, z: cosAngle }
  const verticalDirection = {
    x: sinElevation * cosAngle,
    y: cosElevation,
    z: sinElevation * sinAngle,
  }
  const surfaceDepth = Math.sqrt(Math.max(0, 1 - tipOffset.x ** 2 - tipOffset.y ** 2))
  const contactNormal = {
    x: -cueDirection.x * surfaceDepth + sideDirection.x * tipOffset.x + verticalDirection.x * tipOffset.y,
    y: -cueDirection.y * surfaceDepth + sideDirection.y * tipOffset.x + verticalDirection.y * tipOffset.y,
    z: -cueDirection.z * surfaceDepth + sideDirection.z * tipOffset.x + verticalDirection.z * tipOffset.y,
  }
  return { cueDirection, sideDirection, verticalDirection, contactNormal, tipOffset, elevation }
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

export function shotKinematics(mode: BilliardsMode, angle: number, power: number, spin: Vec2, stroke: StrokeStyle, elevationDegrees = 0): ShotKinematics {
  const spec = getTableSpec(mode)
  const radius = spec.ballDiameter / 2
  const normalizedPower = clamp(power, 0, 100) / 100
  const geometry = cueContactGeometry(angle, spin, elevationDegrees)
  const speed = shotSpeedForPower(power, stroke) * Math.cos(geometry.elevation) ** 2
  // A low-deflection carom shaft still squirts immediately away from the struck side.
  // Elevated-cue swerve is not folded into this value: cloth friction produces it over time.
  const squirtAngle = -geometry.tipOffset.x * (0.25 + normalizedPower * 0.65) * Math.PI / 180
  const launchAngle = angle + squirtAngle
  const direction = { x: Math.cos(launchAngle), y: Math.sin(launchAngle) }
  // The table cancels the cue's downward linear impulse, while its torque about
  // the contact point still affects the ball. Scale the 3D cue impulse so its
  // horizontal projection matches the simulated launch momentum exactly.
  const horizontalImpulse = spec.ballMass * speed
  const projectedImpulse = horizontalImpulse / Math.max(Math.cos(geometry.elevation), 1e-6)
  const impulse = {
    x: geometry.cueDirection.x * projectedImpulse,
    y: geometry.cueDirection.y * projectedImpulse,
    z: geometry.cueDirection.z * projectedImpulse,
  }
  const contact = {
    x: geometry.contactNormal.x * radius,
    y: geometry.contactNormal.y * radius,
    z: geometry.contactNormal.z * radius,
  }
  const angularImpulse = cross(contact, impulse)
  const inertia = momentOfInertia(spec)

  return {
    velocity: { x: direction.x * speed, y: direction.y * speed },
    angularVelocity: {
      x: cleanNumericalZero(angularImpulse.x / inertia),
      y: cleanNumericalZero(angularImpulse.y / inertia),
      z: cleanNumericalZero(angularImpulse.z / inertia),
    },
    impulse,
    launchAngle,
    cueDirection: geometry.cueDirection,
    contactNormal: geometry.contactNormal,
  }
}

export function applyShot(ball: BallState, mode: BilliardsMode, angle: number, power: number, spin: Vec2, stroke: StrokeStyle, elevationDegrees = 0) {
  const kinematics = shotKinematics(mode, angle, power, spin, stroke, elevationDegrees)
  ball.velocity = kinematics.velocity
  ball.angularVelocity = kinematics.angularVelocity
}

export function areBallsStopped(balls: BallState[]) {
  return areBallsTranslationallyStopped(balls) && balls.every((ball) => (
    Math.abs(ball.angularVelocity.y) < PHYSICS.stopSpin
  ))
}

export function areBallsTranslationallyStopped(balls: BallState[]) {
  return balls.every((ball) => (
    Math.hypot(ball.velocity.x, ball.velocity.y) < PHYSICS.stopSpeed
    && Math.hypot(ball.angularVelocity.x, ball.angularVelocity.z) < PHYSICS.stopSpin
  ))
}

export function settleResidualSideSpin(balls: BallState[], stationaryTime: number) {
  if (stationaryTime < PHYSICS.residualSpinGraceTime || !areBallsTranslationallyStopped(balls)) return false
  for (const ball of balls) {
    ball.velocity = { x: 0, y: 0 }
    ball.angularVelocity = zeroAngularVelocity()
  }
  return true
}

function applyClothFriction(ball: BallState, spec: TableSpec, dt: number) {
  const radius = spec.ballDiameter / 2
  const slip = {
    x: ball.velocity.x + ball.angularVelocity.z * radius,
    y: ball.velocity.y - ball.angularVelocity.x * radius,
  }
  const slipSpeed = Math.hypot(slip.x, slip.y)
  let rollingTime = dt

  if (slipSpeed > 0.001) {
    const slideAcceleration = spec.slidingFriction * PHYSICS.gravity
    const velocityDelta = Math.min(slideAcceleration * dt, slipSpeed / 3.5)
    const direction = { x: slip.x / slipSpeed, y: slip.y / slipSpeed }
    ball.velocity.x -= direction.x * velocityDelta
    ball.velocity.y -= direction.y * velocityDelta
    ball.angularVelocity.x += direction.y * (2.5 * velocityDelta / radius)
    ball.angularVelocity.z -= direction.x * (2.5 * velocityDelta / radius)
    rollingTime = Math.max(0, dt - velocityDelta / slideAcceleration)
  }

  const speed = Math.hypot(ball.velocity.x, ball.velocity.y)
  if (rollingTime > 0 && speed > 0) {
    const nextSpeed = Math.max(0, speed - spec.rollingFriction * PHYSICS.gravity * rollingTime)
    const scale = nextSpeed / speed
    ball.velocity.x *= scale
    ball.velocity.y *= scale
    ball.angularVelocity.x = ball.velocity.y / radius
    ball.angularVelocity.z = -ball.velocity.x / radius
  }

  ball.angularVelocity.y = approachZero(ball.angularVelocity.y, spec.sideSpinDeceleration * dt)
  if (Math.abs(ball.angularVelocity.y) < PHYSICS.stopSpin) ball.angularVelocity.y = 0

  const remainingSlip = Math.hypot(
    ball.velocity.x + ball.angularVelocity.z * radius,
    ball.velocity.y - ball.angularVelocity.x * radius,
  )
  if (Math.hypot(ball.velocity.x, ball.velocity.y) < PHYSICS.stopSpeed && remainingSlip < 0.003) {
    ball.velocity = { x: 0, y: 0 }
    ball.angularVelocity.x = 0
    ball.angularVelocity.z = 0
  }
}

function collideBalls(a: BallState, b: BallState, spec: TableSpec, normal: Vec2) {
  const radius = spec.ballDiameter / 2
  const inertia = momentOfInertia(spec)
  const relativeVelocity = { x: b.velocity.x - a.velocity.x, y: b.velocity.y - a.velocity.y }
  const relativeNormalSpeed = dot(relativeVelocity, normal)
  if (relativeNormalSpeed >= 0) return false

  const inverseMassSum = 2 / spec.ballMass
  const normalImpulse = -(1 + PHYSICS.ballRestitution) * relativeNormalSpeed / inverseMassSum
  const tangent = { x: -normal.y, y: normal.x }
  const relativeTangentSpeed = dot(relativeVelocity, tangent) + radius * (a.angularVelocity.y + b.angularVelocity.y)
  const tangentDenominator = inverseMassSum + 2 * radius * radius / inertia
  const tangentImpulse = clamp(
    -relativeTangentSpeed / tangentDenominator,
    -PHYSICS.ballFriction * normalImpulse,
    PHYSICS.ballFriction * normalImpulse,
  )

  a.velocity.x -= (normalImpulse * normal.x + tangentImpulse * tangent.x) / spec.ballMass
  a.velocity.y -= (normalImpulse * normal.y + tangentImpulse * tangent.y) / spec.ballMass
  b.velocity.x += (normalImpulse * normal.x + tangentImpulse * tangent.x) / spec.ballMass
  b.velocity.y += (normalImpulse * normal.y + tangentImpulse * tangent.y) / spec.ballMass
  a.angularVelocity.y += radius * tangentImpulse / inertia
  b.angularVelocity.y += radius * tangentImpulse / inertia
  return true
}

export function stepPhysics(balls: BallState[], mode: BilliardsMode, delta: number, onEvent: (event: ShotEvent) => void) {
  const dt = Math.min(delta, 1 / 120)
  const spec = getTableSpec(mode)
  const radius = spec.ballDiameter / 2
  const xLimit = spec.playingLength / 2 - radius
  const yLimit = spec.playingWidth / 2 - radius

  for (const ball of balls) {
    applyClothFriction(ball, spec, dt)
    ball.position.x += ball.velocity.x * dt
    ball.position.y += ball.velocity.y * dt

    if (ball.position.x > xLimit) {
      ball.position.x = xLimit
      if (ball.velocity.x > 0) {
        resolveCushionImpact(ball, spec, { x: 1, y: 0 }, CUSHION_PARAMETERS)
        if (ball.id === 'cue') onEvent({ type: 'cushion', rail: 'right' })
      }
    } else if (ball.position.x < -xLimit) {
      ball.position.x = -xLimit
      if (ball.velocity.x < 0) {
        resolveCushionImpact(ball, spec, { x: -1, y: 0 }, CUSHION_PARAMETERS)
        if (ball.id === 'cue') onEvent({ type: 'cushion', rail: 'left' })
      }
    }

    if (ball.position.y > yLimit) {
      ball.position.y = yLimit
      if (ball.velocity.y > 0) {
        resolveCushionImpact(ball, spec, { x: 0, y: 1 }, CUSHION_PARAMETERS)
        if (ball.id === 'cue') onEvent({ type: 'cushion', rail: 'top' })
      }
    } else if (ball.position.y < -yLimit) {
      ball.position.y = -yLimit
      if (ball.velocity.y < 0) {
        resolveCushionImpact(ball, spec, { x: 0, y: -1 }, CUSHION_PARAMETERS)
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
      const minDistance = spec.ballDiameter
      if (distance <= 0 || distance >= minDistance) continue

      const normal = { x: dx / distance, y: dy / distance }
      const overlap = minDistance - distance
      a.position.x -= normal.x * overlap * 0.5
      a.position.y -= normal.y * overlap * 0.5
      b.position.x += normal.x * overlap * 0.5
      b.position.y += normal.y * overlap * 0.5

      if (!collideBalls(a, b, spec, normal)) continue
      if (a.id === 'cue') onEvent({ type: 'ball', target: b.id as Exclude<BallId, 'cue'> })
      else if (b.id === 'cue') onEvent({ type: 'ball', target: a.id as Exclude<BallId, 'cue'> })
    }
  }
}
