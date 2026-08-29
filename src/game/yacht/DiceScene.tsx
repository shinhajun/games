import { ContactShadows, RoundedBox } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Group, Quaternion, Vector3 } from 'three'

const pipPatterns: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-0.23, 0.23], [0.23, -0.23]],
  3: [[-0.24, 0.24], [0, 0], [0.24, -0.24]],
  4: [[-0.23, 0.23], [0.23, 0.23], [-0.23, -0.23], [0.23, -0.23]],
  5: [[-0.24, 0.24], [0.24, 0.24], [0, 0], [-0.24, -0.24], [0.24, -0.24]],
  6: [[-0.23, 0.28], [-0.23, 0], [-0.23, -0.28], [0.23, 0.28], [0.23, 0], [0.23, -0.28]],
}

export const DICE_ROLL_DURATION_MS = 1950

const FLOOR_Y = 0.63
const X_LIMIT = 3.28
const Z_LIMIT = 1.18
const COLLISION_DISTANCE = 0.94
const SETTLE_START = 1.28
const FREE_REST_SLOTS: [number, number][] = [
  [-2.55, 0.38],
  [-1.28, -0.12],
  [0, 0.43],
  [1.34, -0.18],
  [2.58, 0.34],
]

interface DieBody {
  position: Vector3
  velocity: Vector3
  angularVelocity: Vector3
  targetPosition: Vector3
  elapsed: number
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

function targetQuaternion(value: number, yaw: number) {
  const face = new Quaternion()
  if (value === 6) face.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI)
  if (value === 2) face.setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2)
  if (value === 5) face.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2)
  if (value === 3) face.setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2)
  if (value === 4) face.setFromAxisAngle(new Vector3(0, 0, 1), -Math.PI / 2)
  return new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw).multiply(face)
}

function seededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

function freeRestPosition(index: number) {
  const [x, z] = FREE_REST_SLOTS[index]
  return new Vector3(x, FLOOR_Y, z)
}

function heldRestPosition(index: number) {
  return new Vector3((index - 2) * 1.35, FLOOR_Y, -0.98)
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

function DiceBodies({ values, held, rolling, rollNonce, onToggle }: {
  values: number[]
  held: boolean[]
  rolling: boolean
  rollNonce: number
  onToggle: (index: number) => void
}) {
  const groups = useRef<Array<Group | null>>([])
  const bodies = useRef<DieBody[]>(values.map((_, index) => ({
    position: freeRestPosition(index),
    velocity: new Vector3(),
    angularVelocity: new Vector3(),
    targetPosition: freeRestPosition(index),
    elapsed: 2,
  })))
  const heldPositions = useMemo(() => values.map((_, index) => heldRestPosition(index)), [values])
  const yaw = useRef(values.map((_, index) => index * 0.31))
  const initializedRollNonce = useRef(0)
  const reducedMotion = useRef(typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const scratch = useMemo(() => ({
    axis: new Vector3(),
    delta: new Vector3(),
    relative: new Vector3(),
    impulse: new Vector3(),
    rotation: new Quaternion(),
  }), [])

  useEffect(() => {
    if (rollNonce === 0 || initializedRollNonce.current === rollNonce) return
    initializedRollNonce.current = rollNonce
    bodies.current.forEach((body, index) => {
      if (held[index]) return
      const random = seededRandom(0x9e3779b9 ^ (rollNonce * 7919) ^ (index * 104729))
      const group = groups.current[index]
      const [restX, restZ] = FREE_REST_SLOTS[index]
      body.targetPosition.set(restX + (random() - 0.5) * 0.16, FLOOR_Y, restZ + (random() - 0.5) * 0.16)
      body.position.set(
        reducedMotion.current ? body.targetPosition.x : -2.88 + (index % 2) * 0.34 + random() * 0.12,
        reducedMotion.current ? FLOOR_Y : 1.72 + index * 0.24 + random() * 0.34,
        reducedMotion.current ? body.targetPosition.z : -0.86 + index * 0.39 + (random() - 0.5) * 0.18,
      )
      body.velocity.set(4.35 + random() * 1.35, 1.25 + random() * 1.35, (random() - 0.5) * 3.9)
      body.angularVelocity.set((random() - 0.5) * 25, (random() - 0.5) * 29, (random() - 0.5) * 25)
      body.elapsed = reducedMotion.current ? 2 : 0
      yaw.current[index] = random() * Math.PI * 2
      if (group) {
        group.position.copy(body.position)
        scratch.axis.set(random() - 0.5, random() - 0.5, random() - 0.5).normalize()
        group.quaternion.setFromAxisAngle(scratch.axis, random() * Math.PI * 2)
      }
    })
  }, [held, rollNonce, scratch])

  useEffect(() => () => { document.body.style.cursor = '' }, [])

  useFrame((_, rawDelta) => {
    const frameDelta = Math.min(rawDelta, 1 / 24)
    const steps = Math.max(1, Math.ceil(frameDelta / (1 / 90)))
    const dt = frameDelta / steps

    if (rolling) {
      for (let step = 0; step < steps; step += 1) {
        bodies.current.forEach((body, index) => {
          if (held[index]) return
          body.elapsed += dt
          body.velocity.y -= 18.2 * dt
          body.position.addScaledVector(body.velocity, dt)

          const group = groups.current[index]
          if (group) {
            const angularSpeed = body.angularVelocity.length()
            if (angularSpeed > 0.001) {
              scratch.axis.copy(body.angularVelocity).multiplyScalar(1 / angularSpeed)
              scratch.rotation.setFromAxisAngle(scratch.axis, angularSpeed * dt)
              group.quaternion.premultiply(scratch.rotation)
            }
          }

          if (body.position.y < FLOOR_Y) {
            body.position.y = FLOOR_Y
            if (body.velocity.y < -0.38) {
              body.velocity.y *= -0.46
              body.angularVelocity.x += body.velocity.z * 0.72
              body.angularVelocity.z -= body.velocity.x * 0.72
            } else {
              body.velocity.y = 0
            }
            const floorDrag = Math.exp(-dt * 3.35)
            body.velocity.x *= floorDrag
            body.velocity.z *= floorDrag
            body.angularVelocity.multiplyScalar(Math.exp(-dt * 2.55))
            body.angularVelocity.x += body.velocity.z * dt * 1.4
            body.angularVelocity.z -= body.velocity.x * dt * 1.4
          }

          if (Math.abs(body.position.x) > X_LIMIT) {
            body.position.x = Math.sign(body.position.x) * X_LIMIT
            body.velocity.x = -body.velocity.x * 0.54
            body.velocity.z *= 0.86
            body.angularVelocity.z += body.velocity.x * 0.82
          }
          if (Math.abs(body.position.z) > Z_LIMIT) {
            body.position.z = Math.sign(body.position.z) * Z_LIMIT
            body.velocity.z = -body.velocity.z * 0.54
            body.velocity.x *= 0.86
            body.angularVelocity.x -= body.velocity.z * 0.82
          }
        })

        for (let first = 0; first < bodies.current.length; first += 1) {
          for (let second = first + 1; second < bodies.current.length; second += 1) {
            if (held[first] && held[second]) continue
            const firstBody = bodies.current[first]
            const secondBody = bodies.current[second]
            scratch.delta.subVectors(secondBody.position, firstBody.position)
            const distance = scratch.delta.length()
            if (distance <= 0.001 || distance >= COLLISION_DISTANCE) continue
            scratch.delta.multiplyScalar(1 / distance)
            const firstInverseMass = held[first] ? 0 : 1
            const secondInverseMass = held[second] ? 0 : 1
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
      const targetPosition = held[index] ? heldPositions[index] : body.targetPosition
      const targetRotation = targetQuaternion(values[index], yaw.current[index])
      const shouldSettle = !rolling || held[index] || body.elapsed >= SETTLE_START

      if (shouldSettle) {
        const settleProgress = !rolling || held[index] ? 1 : Math.min(1, (body.elapsed - SETTLE_START) / 0.58)
        const easedSettle = settleProgress * settleProgress
        const positionBlend = 1 - Math.exp(-frameDelta * (3.5 + easedSettle * 18))
        const rotationBlend = 1 - Math.exp(-frameDelta * (4.5 + easedSettle * 21))
        body.position.lerp(targetPosition, positionBlend)
        group.quaternion.slerp(targetRotation, rotationBlend)
        body.velocity.multiplyScalar(Math.exp(-frameDelta * (5 + easedSettle * 18)))
        body.angularVelocity.multiplyScalar(Math.exp(-frameDelta * (5 + easedSettle * 18)))
      }
      group.position.copy(body.position)
    })
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
      <RoundedBox args={[8.72, 0.54, 4.38]} radius={0.28} smoothness={6} position={[0, -0.27, 0]} receiveShadow>
        <meshStandardMaterial color="#171915" roughness={0.78} />
      </RoundedBox>
      <RoundedBox args={[7.86, 0.13, 3.43]} radius={0.19} smoothness={5} position={[0, 0.05, 0]} receiveShadow>
        <meshStandardMaterial color="#174c3b" roughness={0.96} />
      </RoundedBox>
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
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.121, 0]} receiveShadow>
        <ringGeometry args={[1.54, 1.56, 72]} />
        <meshBasicMaterial color="#66d8ac" transparent opacity={0.1} />
      </mesh>
    </group>
  )
}

export function DiceScene({ values, held, rolling, rollNonce, onToggle }: {
  values: number[]
  held: boolean[]
  rolling: boolean
  rollNonce: number
  onToggle: (index: number) => void
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
      <directionalLight castShadow position={[-3.5, 7.5, 4.8]} intensity={3.15} shadow-mapSize={[768, 768]} shadow-bias={-0.00035} />
      <pointLight position={[4.2, 3.2, -2.3]} intensity={5.8} distance={11} color="#f3c96a" />
      <pointLight position={[-4.2, 2.5, 1.6]} intensity={3.8} distance={10} color="#66d8ac" />
      <DiceTray />
      <DiceBodies values={values} held={held} rolling={rolling} rollNonce={rollNonce} onToggle={onToggle} />
      <ContactShadows position={[0, 0.115, 0]} scale={10} opacity={0.64} blur={2.1} far={3.2} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.52, 0]} receiveShadow>
        <planeGeometry args={[35, 35]} /><meshStandardMaterial color="#0e1210" roughness={1} />
      </mesh>
    </Canvas>
  )
}
