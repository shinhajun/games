import type { BallState, TableSpec, Vec2 } from './engine'

interface CushionParameters {
  energeticRestitution: number
  cushionFriction: number
}

interface LocalImpactState {
  tangentVelocity: number
  normalVelocity: number
  tangentSpin: number
  normalSpin: number
  sideSpin: number
}

interface SlipDirections {
  cushionTangent: number
  cushionVertical: number
  tableTangent: number
  tableNormal: number
}

const MAX_IMPULSE_STEPS = 900
const MIN_IMPULSE_STEP = 0.00002
const VELOCITY_EPSILON = 1e-8

function dot(a: Vec2, b: Vec2) {
  return a.x * b.x + a.y * b.y
}

function unitDirection(x: number, y: number) {
  const length = Math.hypot(x, y)
  if (length < VELOCITY_EPSILON) return { x: 0, y: 0 }
  return { x: x / length, y: y / length }
}

/**
 * Mathavan, Jackson & Parkin (2010), equations 12–14.
 * The local frame is tangent/normal/vertical, with a positive normal velocity
 * approaching the cushion. Both cushion and cloth slip directions are updated
 * during the compression and restitution phases.
 */
function slipDirections(state: LocalImpactState, radius: number, sinTheta: number, cosTheta: number): SlipDirections {
  const cushionSlip = unitDirection(
    state.tangentVelocity + state.normalSpin * radius * sinTheta - state.sideSpin * radius * cosTheta,
    -state.normalVelocity * sinTheta + state.tangentSpin * radius,
  )
  const tableSlip = unitDirection(
    state.tangentVelocity - state.normalSpin * radius,
    state.normalVelocity + state.tangentSpin * radius,
  )
  return {
    cushionTangent: cushionSlip.x,
    cushionVertical: cushionSlip.y,
    tableTangent: tableSlip.x,
    tableNormal: tableSlip.y,
  }
}

function integrateImpulse(
  state: LocalImpactState,
  impulse: number,
  mass: number,
  radius: number,
  clothFriction: number,
  cushionFriction: number,
  sinTheta: number,
  cosTheta: number,
) {
  const slip = slipDirections(state, radius, sinTheta, cosTheta)
  const tableReaction = sinTheta + cushionFriction * slip.cushionVertical * cosTheta
  const inverseMassImpulse = impulse / mass
  const angularImpulse = 2.5 * impulse / (mass * radius)

  return {
    tangentVelocity: state.tangentVelocity - inverseMassImpulse * (
      cushionFriction * slip.cushionTangent
      + clothFriction * slip.tableTangent * tableReaction
    ),
    normalVelocity: state.normalVelocity - inverseMassImpulse * (
      cosTheta
      - cushionFriction * sinTheta * slip.cushionVertical
      + clothFriction * slip.tableNormal * tableReaction
    ),
    tangentSpin: state.tangentSpin - angularImpulse * (
      cushionFriction * slip.cushionVertical
      + clothFriction * slip.tableNormal * tableReaction
    ),
    normalSpin: state.normalSpin - angularImpulse * (
      cushionFriction * slip.cushionTangent * sinTheta
      - clothFriction * slip.tableTangent * tableReaction
    ),
    sideSpin: state.sideSpin + angularImpulse * cushionFriction * slip.cushionTangent * cosTheta,
  }
}

function normalWork(before: LocalImpactState, after: LocalImpactState, impulse: number, cosTheta: number) {
  return 0.5 * (Math.abs(before.normalVelocity) + Math.abs(after.normalVelocity)) * cosTheta * impulse
}

function compressionPhase(
  initial: LocalImpactState,
  impulseStep: number,
  mass: number,
  radius: number,
  clothFriction: number,
  cushionFriction: number,
  sinTheta: number,
  cosTheta: number,
) {
  let state = initial
  let work = 0

  for (let step = 0; step < MAX_IMPULSE_STEPS * 2 && state.normalVelocity > VELOCITY_EPSILON; step += 1) {
    let next = integrateImpulse(state, impulseStep, mass, radius, clothFriction, cushionFriction, sinTheta, cosTheta)
    let appliedImpulse = impulseStep
    if (next.normalVelocity <= 0) {
      let low = 0
      let high = 1
      for (let refinement = 0; refinement < 14; refinement += 1) {
        const middle = (low + high) / 2
        const candidate = integrateImpulse(state, impulseStep * middle, mass, radius, clothFriction, cushionFriction, sinTheta, cosTheta)
        if (candidate.normalVelocity > 0) low = middle
        else high = middle
      }
      appliedImpulse = impulseStep * high
      next = integrateImpulse(state, appliedImpulse, mass, radius, clothFriction, cushionFriction, sinTheta, cosTheta)
    }
    work += normalWork(state, next, appliedImpulse, cosTheta)
    state = next
  }

  return { state, work }
}

function restitutionPhase(
  initial: LocalImpactState,
  targetWork: number,
  impulseStep: number,
  mass: number,
  radius: number,
  clothFriction: number,
  cushionFriction: number,
  sinTheta: number,
  cosTheta: number,
) {
  let state = initial
  let work = 0

  for (let step = 0; step < MAX_IMPULSE_STEPS * 2 && work < targetWork; step += 1) {
    let appliedImpulse = impulseStep
    let next = integrateImpulse(state, appliedImpulse, mass, radius, clothFriction, cushionFriction, sinTheta, cosTheta)
    let addedWork = normalWork(state, next, appliedImpulse, cosTheta)
    const remainingWork = targetWork - work

    if (addedWork > remainingWork) {
      let low = 0
      let high = 1
      for (let refinement = 0; refinement < 14; refinement += 1) {
        const middle = (low + high) / 2
        const candidateImpulse = impulseStep * middle
        const candidate = integrateImpulse(state, candidateImpulse, mass, radius, clothFriction, cushionFriction, sinTheta, cosTheta)
        const candidateWork = normalWork(state, candidate, candidateImpulse, cosTheta)
        if (candidateWork < remainingWork) low = middle
        else high = middle
      }
      appliedImpulse = impulseStep * high
      next = integrateImpulse(state, appliedImpulse, mass, radius, clothFriction, cushionFriction, sinTheta, cosTheta)
      addedWork = normalWork(state, next, appliedImpulse, cosTheta)
    }

    state = next
    work += addedWork
  }

  return state
}

export function resolveCushionImpact(ball: BallState, spec: TableSpec, normal: Vec2, parameters: CushionParameters) {
  const approachingSpeed = dot(ball.velocity, normal)
  if (approachingSpeed <= 0) return false

  const radius = spec.ballDiameter / 2
  const tangent = { x: -normal.y, y: normal.x }
  const sinTheta = Math.max(-0.95, Math.min(0.95, (spec.cushionNoseHeight - radius) / radius))
  const cosTheta = Math.sqrt(1 - sinTheta * sinTheta)
  const initial: LocalImpactState = {
    tangentVelocity: dot(ball.velocity, tangent),
    normalVelocity: approachingSpeed,
    tangentSpin: ball.angularVelocity.x * tangent.x + ball.angularVelocity.z * tangent.y,
    normalSpin: ball.angularVelocity.x * normal.x + ball.angularVelocity.z * normal.y,
    sideSpin: ball.angularVelocity.y,
  }
  const impulseStep = Math.max(spec.ballMass * approachingSpeed / MAX_IMPULSE_STEPS, MIN_IMPULSE_STEP)
  const compression = compressionPhase(
    initial,
    impulseStep,
    spec.ballMass,
    radius,
    spec.slidingFriction,
    parameters.cushionFriction,
    sinTheta,
    cosTheta,
  )
  const resolved = restitutionPhase(
    compression.state,
    parameters.energeticRestitution ** 2 * compression.work,
    impulseStep,
    spec.ballMass,
    radius,
    spec.slidingFriction,
    parameters.cushionFriction,
    sinTheta,
    cosTheta,
  )

  ball.velocity = {
    x: tangent.x * resolved.tangentVelocity + normal.x * resolved.normalVelocity,
    y: tangent.y * resolved.tangentVelocity + normal.y * resolved.normalVelocity,
  }
  ball.angularVelocity = {
    x: tangent.x * resolved.tangentSpin + normal.x * resolved.normalSpin,
    y: resolved.sideSpin,
    z: tangent.y * resolved.tangentSpin + normal.y * resolved.normalSpin,
  }
  return true
}
