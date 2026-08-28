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

const FLOOR_Y = 0.63
const X_LIMIT = 3.28
const Z_LIMIT = 1.18
const COLLISION_DISTANCE = 0.94
const SETTLE_START = 1.02

interface DieBody {
  position: Vector3
  velocity: Vector3
  angularVelocity: Vector3
  elapsed: number
}

function Pip({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[0.066, 14, 10]} />
      <meshStandardMaterial color="#171a18" roughness={0.72} />
    </mesh>
  )
}

function PipFaces() {
  return (
    <>
      {pipPatterns[1].map(([a, b], index) => <Pip key={`top-${index}`} position={[a, 0.512, b]} />)}
      {pipPatterns[6].map(([a, b], index) => <Pip key={`bottom-${index}`} position={[a, -0.512, b]} />)}
      {pipPatterns[2].map(([a, b], index) => <Pip key={`front-${index}`} position={[a, b, 0.512]} />)}
      {pipPatterns[5].map(([a, b], index) => <Pip key={`back-${index}`} position={[-a, b, -0.512]} />)}
      {pipPatterns[3].map(([a, b], index) => <Pip key={`right-${index}`} position={[0.512, b, -a]} />)}
      {pipPatterns[4].map(([a, b], index) => <Pip key={`left-${index}`} position={[-0.512, b, a]} />)}
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

function restPosition(index: number, held: boolean) {
  const zOffsets = [0.22, -0.25, 0.16, -0.2, 0.12]
  return new Vector3((index - 2) * 1.36, held ? FLOOR_Y + 0.17 : FLOOR_Y, zOffsets[index])
}

function DieVisual({ held }: { held: boolean }) {
  return (
    <>
      <RoundedBox args={[1, 1, 1]} radius={0.13} smoothness={5} castShadow>
        <meshPhysicalMaterial color={held ? '#f3c96a' : '#f3efe5'} roughness={0.29} clearcoat={0.62} clearcoatRoughness={0.22} />
      </RoundedBox>
      <PipFaces />
      {held && (
        <mesh position={[0, -0.64, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.48, 0.57, 40]} />
          <meshBasicMaterial color="#f2c65d" transparent opacity={0.66} />
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
    position: restPosition(index, false),
    velocity: new Vector3(),
    angularVelocity: new Vector3(),
    elapsed: 2,
  })))
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
      body.position.set(
        (index - 2) * 0.82 + (random() - 0.5) * 0.35,
        reducedMotion.current ? FLOOR_Y : 2.15 + random() * 1.1,
        (random() - 0.5) * 1.45,
      )
      body.velocity.set((random() - 0.5) * 2.8, 0.6 + random() * 1.1, (random() - 0.5) * 2.5)
      body.angularVelocity.set((random() - 0.5) * 18, (random() - 0.5) * 21, (random() - 0.5) * 18)
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
          body.velocity.y -= 13.4 * dt
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
            if (body.velocity.y < -0.32) {
              body.velocity.y *= -0.4
              body.angularVelocity.x += body.velocity.z * 0.5
              body.angularVelocity.z -= body.velocity.x * 0.5
            } else {
              body.velocity.y = 0
            }
            const floorDrag = Math.exp(-dt * 4.4)
            body.velocity.x *= floorDrag
            body.velocity.z *= floorDrag
            body.angularVelocity.multiplyScalar(Math.exp(-dt * 3.2))
          }

          if (Math.abs(body.position.x) > X_LIMIT) {
            body.position.x = Math.sign(body.position.x) * X_LIMIT
            body.velocity.x = -body.velocity.x * 0.46
            body.velocity.z *= 0.84
            body.angularVelocity.z += body.velocity.x * 0.65
          }
          if (Math.abs(body.position.z) > Z_LIMIT) {
            body.position.z = Math.sign(body.position.z) * Z_LIMIT
            body.velocity.z = -body.velocity.z * 0.46
            body.velocity.x *= 0.84
            body.angularVelocity.x -= body.velocity.z * 0.65
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
            const impulseMagnitude = -(1 + 0.38) * closingSpeed / inverseMass
            scratch.impulse.copy(scratch.delta).multiplyScalar(impulseMagnitude)
            firstBody.velocity.addScaledVector(scratch.impulse, -firstInverseMass)
            secondBody.velocity.addScaledVector(scratch.impulse, secondInverseMass)
            firstBody.angularVelocity.addScaledVector(scratch.delta, -closingSpeed * 0.42 * firstInverseMass)
            secondBody.angularVelocity.addScaledVector(scratch.delta, closingSpeed * 0.42 * secondInverseMass)
          }
        }
      }
    }

    bodies.current.forEach((body, index) => {
      const group = groups.current[index]
      if (!group) return
      const targetPosition = restPosition(index, held[index])
      const targetRotation = targetQuaternion(values[index], yaw.current[index])
      const shouldSettle = !rolling || held[index] || body.elapsed >= SETTLE_START

      if (shouldSettle) {
        const settleProgress = !rolling || held[index] ? 1 : Math.min(1, (body.elapsed - SETTLE_START) / 0.38)
        const positionBlend = 1 - Math.exp(-frameDelta * (7 + settleProgress * 19))
        const rotationBlend = 1 - Math.exp(-frameDelta * (8 + settleProgress * 23))
        body.position.lerp(targetPosition, positionBlend)
        group.quaternion.slerp(targetRotation, rotationBlend)
        body.velocity.multiplyScalar(Math.exp(-frameDelta * (7 + settleProgress * 20)))
        body.angularVelocity.multiplyScalar(Math.exp(-frameDelta * (7 + settleProgress * 20)))
      }
      group.position.copy(body.position)
    })
  })

  return values.map((_, index) => (
    <group
      key={index}
      ref={(node) => { groups.current[index] = node }}
      position={restPosition(index, false)}
      onClick={(event) => { event.stopPropagation(); onToggle(index) }}
      onPointerEnter={(event) => { event.stopPropagation(); document.body.style.cursor = 'pointer' }}
      onPointerLeave={() => { document.body.style.cursor = '' }}
    >
      <DieVisual held={held[index]} />
    </group>
  ))
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
      camera={{ position: [0, 7.6, 8.6], fov: 38, near: 0.1, far: 50 }}
      gl={{ antialias: true, powerPreference: 'default' }}
      fallback={<div className="webgl-fallback">3D 화면을 불러올 수 없습니다. 브라우저의 WebGL 설정을 확인해 주세요.</div>}
    >
      <color attach="background" args={['#10120f']} />
      <fog attach="fog" args={['#10120f', 11, 24]} />
      <ambientLight intensity={0.82} />
      <directionalLight castShadow position={[-2, 7, 4]} intensity={2.5} shadow-mapSize={[768, 768]} />
      <pointLight position={[4, 3, -2]} intensity={9} distance={10} color="#f3bf50" />
      <pointLight position={[-4, 2, 1]} intensity={6} distance={9} color="#4ec59a" />
      <RoundedBox args={[8.4, 0.5, 4.05]} radius={0.24} smoothness={5} position={[0, -0.24, 0]} receiveShadow>
        <meshStandardMaterial color="#242a24" roughness={0.66} />
      </RoundedBox>
      <RoundedBox args={[7.72, 0.12, 3.36]} radius={0.18} smoothness={4} position={[0, 0.05, 0]} receiveShadow>
        <meshStandardMaterial color="#153e32" roughness={0.84} />
      </RoundedBox>
      <DiceBodies values={values} held={held} rolling={rolling} rollNonce={rollNonce} onToggle={onToggle} />
      <ContactShadows position={[0, 0.1, 0]} scale={11} opacity={0.6} blur={2.3} far={3.2} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.52, 0]} receiveShadow>
        <planeGeometry args={[35, 35]} /><meshStandardMaterial color="#10120f" roughness={1} />
      </mesh>
    </Canvas>
  )
}
