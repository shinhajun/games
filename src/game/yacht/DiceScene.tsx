import { ContactShadows, RoundedBox } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Group, Quaternion, Vector3 } from 'three'
import { dieHalfExtents, quaternionForTopFace, topFaceFromQuaternion, uprightQuaternionForTopFace } from './dicePhysics'

const pipPatterns: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-0.23, 0.23], [0.23, -0.23]],
  3: [[-0.24, 0.24], [0, 0], [0.24, -0.24]],
  4: [[-0.23, 0.23], [0.23, 0.23], [-0.23, -0.23], [0.23, -0.23]],
  5: [[-0.24, 0.24], [0.24, 0.24], [0, 0], [-0.24, -0.24], [0.24, -0.24]],
  6: [[-0.23, 0.28], [-0.23, 0], [-0.23, -0.28], [0.23, 0.28], [0.23, 0], [0.23, -0.28]],
}

const FELT_TOP_Y = 0.112
const DIE_HALF_SIZE = 0.5
const COLLISION_SKIN = 0.025
const REST_CENTER_Y = FELT_TOP_Y + DIE_HALF_SIZE + COLLISION_SKIN
const INNER_WALL_X = 3
const INNER_WALL_Z = 1.72
const COLLISION_DISTANCE = 1.02
const MIN_SETTLE_TIME = 1.05
const MAX_SETTLE_TIME = 2.85
const SETTLE_ANIMATION_TIME = 0.28
const FREE_REST_SLOTS: [number, number][] = [
  [-2.25, 0.38],
  [-1.12, -0.12],
  [0, 0.43],
  [1.12, -0.18],
  [2.25, 0.34],
]

interface DieBody {
  position: Vector3
  restPosition: Vector3
  velocity: Vector3
  angularVelocity: Vector3
  restQuaternion: Quaternion
  elapsed: number
  settleElapsed: number
  result: number | null
}

function Pip({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={position} castShadow>
      <sphereGeometry args={[0.073, 16, 12]} />
      <meshStandardMaterial color="#101412" roughness={0.6} metalness={0.04} />
    </mesh>
  )
}

function PipFaces() {
  return (
    <>
      {pipPatterns[1].map(([a, b], index) => <Pip key={`top-${index}`} position={[a, 0.486, b]} />)}
      {pipPatterns[6].map(([a, b], index) => <Pip key={`bottom-${index}`} position={[a, -0.486, b]} />)}
      {pipPatterns[2].map(([a, b], index) => <Pip key={`front-${index}`} position={[a, b, 0.486]} />)}
      {pipPatterns[5].map(([a, b], index) => <Pip key={`back-${index}`} position={[-a, b, -0.486]} />)}
      {pipPatterns[3].map(([a, b], index) => <Pip key={`right-${index}`} position={[0.486, b, -a]} />)}
      {pipPatterns[4].map(([a, b], index) => <Pip key={`left-${index}`} position={[-0.486, b, a]} />)}
    </>
  )
}

function seededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

function entropySeed() {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return crypto.getRandomValues(new Uint32Array(1))[0]
  }
  return Math.floor(Math.random() * 4294967296) >>> 0
}

function freeRestPosition(index: number) {
  const [x, z] = FREE_REST_SLOTS[index]
  return new Vector3(x, REST_CENTER_Y, z)
}

function heldRestPosition(index: number) {
  return new Vector3((index - 2) * 1.15, REST_CENTER_Y, -0.98)
}

function createBody(index: number, value: number): DieBody {
  const position = freeRestPosition(index)
  return {
    position,
    restPosition: position.clone(),
    velocity: new Vector3(),
    angularVelocity: new Vector3(),
    restQuaternion: quaternionForTopFace(value, index * 0.31),
    elapsed: MAX_SETTLE_TIME,
    settleElapsed: SETTLE_ANIMATION_TIME,
    result: value,
  }
}

function DieVisual({ held }: { held: boolean }) {
  return (
    <>
      <RoundedBox args={[1, 1, 1]} radius={0.145} smoothness={6} castShadow receiveShadow>
        <meshPhysicalMaterial
          color={held ? '#f2c65d' : '#f4f0e7'}
          roughness={held ? 0.32 : 0.26}
          clearcoat={0.72}
          clearcoatRoughness={0.2}
          sheen={0.16}
          sheenColor={held ? '#7b5a18' : '#ffffff'}
        />
      </RoundedBox>
      <PipFaces />
      {held && (
        <mesh position={[0, -0.505, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.49, 0.59, 48]} />
          <meshBasicMaterial color="#f2c65d" transparent opacity={0.74} />
        </mesh>
      )}
    </>
  )
}

function DiceBodies({ values, held, rolling, rollNonce, onToggle, onRollComplete }: {
  values: number[]
  held: boolean[]
  rolling: boolean
  rollNonce: number
  onToggle: (index: number) => void
  onRollComplete: (values: number[]) => void
}) {
  const groups = useRef<Array<Group | null>>([])
  const bodies = useRef<DieBody[]>(values.map((value, index) => createBody(index, value)))
  const heldPositions = useMemo(() => values.map((_, index) => heldRestPosition(index)), [values])
  const initializedRollNonce = useRef(0)
  const reportedRollNonce = useRef(0)
  const valuesRef = useRef(values)
  const heldRef = useRef(held)
  const onRollCompleteRef = useRef(onRollComplete)
  const reducedMotion = useRef(typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const scratch = useMemo(() => ({
    axis: new Vector3(),
    delta: new Vector3(),
    relative: new Vector3(),
    impulse: new Vector3(),
    rotation: new Quaternion(),
    extents: new Vector3(),
  }), [])

  useEffect(() => {
    valuesRef.current = values
    heldRef.current = held
    onRollCompleteRef.current = onRollComplete
  }, [held, onRollComplete, values])

  useEffect(() => {
    if (rollNonce === 0 || initializedRollNonce.current === rollNonce) return
    initializedRollNonce.current = rollNonce

    bodies.current.forEach((body, index) => {
      if (held[index]) {
        body.result = values[index]
        body.settleElapsed = SETTLE_ANIMATION_TIME
        return
      }

      const random = seededRandom(entropySeed() ^ (rollNonce * 7919) ^ (index * 104729))
      const group = groups.current[index]
      body.position.set(
        reducedMotion.current ? FREE_REST_SLOTS[index][0] : -2.9 + (index % 2) * 0.34 + random() * 0.13,
        reducedMotion.current ? REST_CENTER_Y : 1.85 + index * 0.22 + random() * 0.42,
        reducedMotion.current ? FREE_REST_SLOTS[index][1] : -0.86 + index * 0.39 + (random() - 0.5) * 0.2,
      )
      body.velocity.set(
        reducedMotion.current ? 0 : 4.45 + random() * 1.5,
        reducedMotion.current ? 0 : 1.35 + random() * 1.5,
        reducedMotion.current ? 0 : (random() - 0.5) * 4.2,
      )
      body.angularVelocity.set(
        reducedMotion.current ? 0 : (random() - 0.5) * 27,
        reducedMotion.current ? 0 : (random() - 0.5) * 31,
        reducedMotion.current ? 0 : (random() - 0.5) * 27,
      )
      body.elapsed = 0
      body.settleElapsed = 0
      body.result = null

      if (group) {
        group.position.copy(body.position)
        scratch.axis.set(random() - 0.5, random() - 0.5, random() - 0.5).normalize()
        group.quaternion.setFromAxisAngle(scratch.axis, random() * Math.PI * 2)
        if (reducedMotion.current) {
          body.result = topFaceFromQuaternion(group.quaternion)
          body.restQuaternion.copy(uprightQuaternionForTopFace(group.quaternion))
          body.restPosition.set(body.position.x, REST_CENTER_Y, body.position.z)
        }
      }
    })
  }, [held, rollNonce, scratch, values])

  useEffect(() => () => { document.body.style.cursor = '' }, [])

  useFrame((_, rawDelta) => {
    const frameDelta = Math.min(rawDelta, 1 / 24)
    const steps = Math.max(1, Math.ceil(frameDelta / (1 / 90)))
    const dt = frameDelta / steps

    if (rolling) {
      for (let step = 0; step < steps; step += 1) {
        bodies.current.forEach((body, index) => {
          if (held[index] || body.result !== null) return
          const group = groups.current[index]
          if (!group) return

          body.elapsed += dt
          body.velocity.y -= 18.2 * dt
          body.position.addScaledVector(body.velocity, dt)

          const angularSpeed = body.angularVelocity.length()
          if (angularSpeed > 0.001) {
            scratch.axis.copy(body.angularVelocity).multiplyScalar(1 / angularSpeed)
            scratch.rotation.setFromAxisAngle(scratch.axis, angularSpeed * dt)
            group.quaternion.premultiply(scratch.rotation)
          }

          dieHalfExtents(group.quaternion, DIE_HALF_SIZE, scratch.extents)
          const floorCenter = FELT_TOP_Y + scratch.extents.y + COLLISION_SKIN
          if (body.position.y < floorCenter) {
            body.position.y = floorCenter
            if (body.velocity.y < -0.38) {
              body.velocity.y *= -0.46
              body.angularVelocity.x += body.velocity.z * 0.68
              body.angularVelocity.z -= body.velocity.x * 0.68
            } else {
              body.velocity.y = 0
            }
            const floorDrag = Math.exp(-dt * 3.5)
            body.velocity.x *= floorDrag
            body.velocity.z *= floorDrag
            body.angularVelocity.multiplyScalar(Math.exp(-dt * 2.7))
            body.angularVelocity.x += body.velocity.z * dt * 1.4
            body.angularVelocity.z -= body.velocity.x * dt * 1.4
          }

          const maximumX = INNER_WALL_X - scratch.extents.x
          const maximumZ = INNER_WALL_Z - scratch.extents.z
          if (Math.abs(body.position.x) > maximumX) {
            body.position.x = Math.sign(body.position.x) * maximumX
            body.velocity.x = -body.velocity.x * 0.54
            body.velocity.z *= 0.86
            body.angularVelocity.z += body.velocity.x * 0.82
          }
          if (Math.abs(body.position.z) > maximumZ) {
            body.position.z = Math.sign(body.position.z) * maximumZ
            body.velocity.z = -body.velocity.z * 0.54
            body.velocity.x *= 0.86
            body.angularVelocity.x -= body.velocity.z * 0.82
          }

          const onFloor = body.position.y <= floorCenter + 0.004
          const canSettle = body.elapsed >= MIN_SETTLE_TIME
            && onFloor
            && (body.elapsed >= MAX_SETTLE_TIME
              || (body.velocity.lengthSq() < 0.2 && body.angularVelocity.lengthSq() < 1.45))
          if (canSettle) {
            body.result = topFaceFromQuaternion(group.quaternion)
            body.restQuaternion.copy(uprightQuaternionForTopFace(group.quaternion))
            body.restPosition.set(body.position.x, REST_CENTER_Y, body.position.z)
            body.velocity.set(0, 0, 0)
            body.angularVelocity.set(0, 0, 0)
            body.settleElapsed = 0
          }
        })

        for (let first = 0; first < bodies.current.length; first += 1) {
          for (let second = first + 1; second < bodies.current.length; second += 1) {
            const firstBody = bodies.current[first]
            const secondBody = bodies.current[second]
            const firstStatic = held[first] || firstBody.result !== null
            const secondStatic = held[second] || secondBody.result !== null
            if (firstStatic && secondStatic) continue

            scratch.delta.subVectors(secondBody.position, firstBody.position)
            const distance = scratch.delta.length()
            if (distance <= 0.001 || distance >= COLLISION_DISTANCE) continue
            scratch.delta.multiplyScalar(1 / distance)
            const firstInverseMass = firstStatic ? 0 : 1
            const secondInverseMass = secondStatic ? 0 : 1
            const inverseMass = firstInverseMass + secondInverseMass
            const overlap = COLLISION_DISTANCE - distance
            firstBody.position.addScaledVector(scratch.delta, -overlap * firstInverseMass / inverseMass)
            secondBody.position.addScaledVector(scratch.delta, overlap * secondInverseMass / inverseMass)
            scratch.relative.subVectors(secondBody.velocity, firstBody.velocity)
            const closingSpeed = scratch.relative.dot(scratch.delta)
            if (closingSpeed >= 0) continue
            const impulseMagnitude = -(1 + 0.44) * closingSpeed / inverseMass
            scratch.impulse.copy(scratch.delta).multiplyScalar(impulseMagnitude)
            firstBody.velocity.addScaledVector(scratch.impulse, -firstInverseMass)
            secondBody.velocity.addScaledVector(scratch.impulse, secondInverseMass)
            firstBody.angularVelocity.addScaledVector(scratch.delta, -closingSpeed * 0.58 * firstInverseMass)
            secondBody.angularVelocity.addScaledVector(scratch.delta, closingSpeed * 0.58 * secondInverseMass)
          }
        }
      }
    }

    bodies.current.forEach((body, index) => {
      const group = groups.current[index]
      if (!group) return

      if (held[index] || body.result !== null || !rolling) {
        if (body.result !== null && rolling && !held[index]) body.settleElapsed += frameDelta
        const targetPosition = held[index] ? heldPositions[index] : body.restPosition
        const blend = 1 - Math.exp(-frameDelta * (rolling ? 18 : 11))
        body.position.lerp(targetPosition, blend)
        group.quaternion.slerp(body.restQuaternion, blend)

        dieHalfExtents(group.quaternion, DIE_HALF_SIZE, scratch.extents)
        body.position.y = Math.max(body.position.y, FELT_TOP_Y + scratch.extents.y + COLLISION_SKIN)
      }
      group.position.copy(body.position)
    })

    if (rolling
      && rollNonce !== 0
      && initializedRollNonce.current === rollNonce
      && reportedRollNonce.current !== rollNonce) {
      const complete = bodies.current.every((body, index) => heldRef.current[index]
        || (body.result !== null && body.settleElapsed >= SETTLE_ANIMATION_TIME))
      if (complete) {
        reportedRollNonce.current = rollNonce
        const nextValues = valuesRef.current.map((value, index) => heldRef.current[index]
          ? value
          : bodies.current[index].result ?? value)
        onRollCompleteRef.current(nextValues)
      }
    }
  })

  return values.map((_, index) => (
    <group
      key={index}
      ref={(node) => { groups.current[index] = node }}
      position={freeRestPosition(index)}
      onClick={(event) => { event.stopPropagation(); onToggle(index) }}
      onPointerEnter={(event) => { event.stopPropagation(); document.body.style.cursor = 'pointer' }}
      onPointerLeave={() => { document.body.style.cursor = '' }}
    >
      <DieVisual held={held[index]} />
    </group>
  ))
}

function DiceTray() {
  const railMaterial = <meshPhysicalMaterial color="#35271d" roughness={0.46} clearcoat={0.34} clearcoatRoughness={0.38} />

  return (
    <group>
      <RoundedBox args={[8.72, 0.54, 4.38]} radius={0.24} smoothness={6} position={[0, -0.27, 0]} receiveShadow>
        <meshStandardMaterial color="#171915" roughness={0.78} />
      </RoundedBox>
      <mesh position={[0, 0.052, 0]} receiveShadow>
        <boxGeometry args={[7.86, 0.12, 3.43]} />
        <meshStandardMaterial color="#174c3b" roughness={0.96} />
      </mesh>
      <RoundedBox args={[8.62, 0.5, 0.35]} radius={0.14} smoothness={5} position={[0, 0.19, -1.91]} castShadow receiveShadow>
        {railMaterial}
      </RoundedBox>
      <RoundedBox args={[8.62, 0.5, 0.35]} radius={0.14} smoothness={5} position={[0, 0.19, 1.91]} castShadow receiveShadow>
        {railMaterial}
      </RoundedBox>
      <RoundedBox args={[0.35, 0.5, 3.48]} radius={0.14} smoothness={5} position={[-4.14, 0.19, 0]} castShadow receiveShadow>
        {railMaterial}
      </RoundedBox>
      <RoundedBox args={[0.35, 0.5, 3.48]} radius={0.14} smoothness={5} position={[4.14, 0.19, 0]} castShadow receiveShadow>
        {railMaterial}
      </RoundedBox>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FELT_TOP_Y + 0.003, 0]} receiveShadow>
        <ringGeometry args={[1.54, 1.56, 72]} />
        <meshBasicMaterial color="#66d8ac" transparent opacity={0.1} />
      </mesh>
    </group>
  )
}

export function DiceScene({ values, held, rolling, rollNonce, onToggle, onRollComplete }: {
  values: number[]
  held: boolean[]
  rolling: boolean
  rollNonce: number
  onToggle: (index: number) => void
  onRollComplete: (values: number[]) => void
}) {
  return (
    <Canvas
      shadows="basic"
      dpr={[1, 1.35]}
      camera={{ position: [0, 6.65, 7.55], fov: 36, near: 0.1, far: 50 }}
      gl={{ antialias: true, powerPreference: 'default' }}
      fallback={<div className="webgl-fallback">3D 화면을 불러올 수 없습니다. 브라우저의 WebGL 설정을 확인해 주세요.</div>}
    >
      <color attach="background" args={['#0e1210']} />
      <fog attach="fog" args={['#0e1210', 10.5, 22]} />
      <hemisphereLight color="#f6efe0" groundColor="#07120e" intensity={1.05} />
      <directionalLight castShadow position={[-3.5, 7.5, 4.8]} intensity={3.15} shadow-intensity={0.3} shadow-mapSize={[768, 768]} shadow-bias={-0.00035} />
      <pointLight position={[4.2, 3.2, -2.3]} intensity={5.8} distance={11} color="#f3c96a" />
      <pointLight position={[-4.2, 2.5, 1.6]} intensity={3.8} distance={10} color="#66d8ac" />
      <DiceTray />
      <DiceBodies
        values={values}
        held={held}
        rolling={rolling}
        rollNonce={rollNonce}
        onToggle={onToggle}
        onRollComplete={onRollComplete}
      />
      <ContactShadows position={[0, FELT_TOP_Y + 0.002, 0]} scale={10} opacity={0.14} blur={4.2} far={1.35} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.52, 0]} receiveShadow>
        <planeGeometry args={[35, 35]} /><meshStandardMaterial color="#0e1210" roughness={1} />
      </mesh>
    </Canvas>
  )
}
