import { ContactShadows, RoundedBox, Sparkles } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import RAPIER, { type RigidBody, type World } from '@dimforge/rapier3d-compat'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { Group, MeshBasicMaterial, PointLight, Quaternion } from 'three'
import type { YachtCelebrationEvent, YachtCelebrationTier } from './celebration'
import { quaternionForTopFace, topFaceFromQuaternion } from './dicePhysics'

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
const DIE_CORNER_RADIUS = 0.145
const DIE_CORE_HALF_SIZE = DIE_HALF_SIZE - DIE_CORNER_RADIUS
const REST_CENTER_Y = FELT_TOP_Y + DIE_HALF_SIZE + 0.004
const FIXED_TIMESTEP = 1 / 120
const MAX_FRAME_DELTA = 0.1
const MIN_ROLL_TIME = 0.7
const MAX_ROLL_TIME = 6
const REQUIRED_STABLE_TIME = 0.32
const LINEAR_STABLE_SPEED_SQUARED = 0.018
const ANGULAR_STABLE_SPEED_SQUARED = 0.12
const CONTAINMENT_WALL_HALF_HEIGHT = 1.3
const CONTAINMENT_WALL_CENTER_Y = FELT_TOP_Y + CONTAINMENT_WALL_HALF_HEIGHT
const CELEBRATION_DURATION = 2.35
const FREE_REST_SLOTS: [number, number][] = [
  [-2.25, 0.38],
  [-1.12, -0.12],
  [0, 0.43],
  [1.12, -0.18],
  [2.25, 0.34],
]

interface DicePhysicsState {
  world: World
  bodies: RigidBody[]
  accumulator: number
  active: boolean
  activeRollNonce: number
  elapsed: number
  stableFor: number[]
}

let rapierInitialization: Promise<void> | null = null

function initializeRapier() {
  rapierInitialization ??= RAPIER.init()
  return rapierInitialization
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

function heldRestPosition(index: number) {
  return { x: (index - 2) * 0.04, y: -5, z: 0 }
}

function freeRestPosition(index: number) {
  const [x, z] = FREE_REST_SLOTS[index]
  return { x, y: REST_CENTER_Y, z }
}

function randomQuaternion(random: () => number) {
  const u1 = random()
  const u2 = random() * Math.PI * 2
  const u3 = random() * Math.PI * 2
  const firstRadius = Math.sqrt(1 - u1)
  const secondRadius = Math.sqrt(u1)

  return new Quaternion(
    firstRadius * Math.sin(u2),
    firstRadius * Math.cos(u2),
    secondRadius * Math.sin(u3),
    secondRadius * Math.cos(u3),
  )
}

function createPhysicsState(values: number[], held: boolean[]): DicePhysicsState {
  const world = new RAPIER.World({ x: 0, y: -24, z: 0 })
  world.timestep = FIXED_TIMESTEP
  world.numSolverIterations = 8
  world.numAdditionalFrictionIterations = 8
  world.integrationParameters.maxCcdSubsteps = 2

  world.createCollider(
    RAPIER.ColliderDesc.cuboid(3.93, 0.06, 1.715)
      .setTranslation(0, 0.052, 0)
      .setFriction(0.74)
      .setRestitution(0.18),
  )

  const longRail = RAPIER.ColliderDesc.cuboid(4.31, CONTAINMENT_WALL_HALF_HEIGHT, 0.175)
    .setFriction(0.46)
    .setRestitution(0.3)
  world.createCollider(longRail.setTranslation(0, CONTAINMENT_WALL_CENTER_Y, -1.91))
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(4.31, CONTAINMENT_WALL_HALF_HEIGHT, 0.175)
      .setTranslation(0, CONTAINMENT_WALL_CENTER_Y, 1.91)
      .setFriction(0.46)
      .setRestitution(0.3),
  )
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.175, CONTAINMENT_WALL_HALF_HEIGHT, 1.74)
      .setTranslation(-4.14, CONTAINMENT_WALL_CENTER_Y, 0)
      .setFriction(0.46)
      .setRestitution(0.3),
  )
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.175, CONTAINMENT_WALL_HALF_HEIGHT, 1.74)
      .setTranslation(4.14, CONTAINMENT_WALL_CENTER_Y, 0)
      .setFriction(0.46)
      .setRestitution(0.3),
  )

  const bodies = values.map((value, index) => {
    const position = held[index] ? heldRestPosition(index) : freeRestPosition(index)
    const rotation = quaternionForTopFace(value, index * 0.31)
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setRotation(rotation)
        .setLinearDamping(0.08)
        .setAngularDamping(0.11)
        .setCanSleep(true)
        .setSleeping(true)
        .setCcdEnabled(true),
    )
    world.createCollider(
      RAPIER.ColliderDesc.roundCuboid(
        DIE_CORE_HALF_SIZE,
        DIE_CORE_HALF_SIZE,
        DIE_CORE_HALF_SIZE,
        DIE_CORNER_RADIUS,
      )
        .setMass(0.016)
        .setFriction(0.58)
        .setRestitution(0.26),
      body,
    )
    if (held[index]) body.setBodyType(RAPIER.RigidBodyType.Fixed, false)
    return body
  })

  return {
    world,
    bodies,
    accumulator: 0,
    active: false,
    activeRollNonce: 0,
    elapsed: 0,
    stableFor: values.map(() => 0),
  }
}

function placeIdleBody(body: RigidBody, index: number, value: number, isHeld: boolean) {
  const position = isHeld ? heldRestPosition(index) : freeRestPosition(index)
  const rotation = quaternionForTopFace(value, index * 0.31)
  body.setBodyType(isHeld ? RAPIER.RigidBodyType.Fixed : RAPIER.RigidBodyType.Dynamic, false)
  body.setTranslation(position, false)
  body.setRotation(rotation, false)
  body.setLinvel({ x: 0, y: 0, z: 0 }, false)
  body.setAngvel({ x: 0, y: 0, z: 0 }, false)
  if (!isHeld) body.sleep()
}

function launchPhysicsRoll(
  state: DicePhysicsState,
  rollNonce: number,
  values: number[],
  held: boolean[],
  reducedMotion: boolean,
) {
  if (state.activeRollNonce === rollNonce) return
  state.activeRollNonce = rollNonce
  state.active = true
  state.accumulator = 0
  state.elapsed = 0
  state.stableFor.fill(0)

  state.bodies.forEach((body, index) => {
    if (held[index]) {
      placeIdleBody(body, index, values[index], true)
      return
    }

    const random = seededRandom(entropySeed() ^ (rollNonce * 7919) ^ (index * 104729))
    const launchX = (index - 2) * 1.25 + (random() - 0.5) * 0.12
    const launchZ = (index % 2 === 0 ? -0.7 : 0.58) + (random() - 0.5) * 0.1
    const motionScale = reducedMotion ? 0.72 : 1
    const horizontalX = ((-Math.sign(launchX) * (0.72 + random() * 1.15)) + (random() - 0.5) * 0.5) * motionScale
    const horizontalZ = ((-Math.sign(launchZ) * (0.8 + random() * 1.2)) + (random() - 0.5) * 0.7) * motionScale
    const rotation = randomQuaternion(random)

    body.setBodyType(RAPIER.RigidBodyType.Dynamic, true)
    body.setTranslation({ x: launchX, y: 1.4 + random() * 0.35, z: launchZ }, true)
    body.setRotation(rotation, true)
    body.setLinvel({ x: horizontalX, y: (3.8 + random() * 1.35) * motionScale, z: horizontalZ }, true)
    body.setAngvel({
      x: (random() - 0.5) * 42 * motionScale,
      y: (random() - 0.5) * 48 * motionScale,
      z: (random() - 0.5) * 42 * motionScale,
    }, true)
    body.wakeUp()
  })
}

function DieVisual() {
  return (
    <>
      <RoundedBox args={[1, 1, 1]} radius={0.145} smoothness={6} castShadow receiveShadow>
        <meshPhysicalMaterial
          color="#f4f0e7"
          roughness={0.26}
          clearcoat={0.72}
          clearcoatRoughness={0.2}
          sheen={0.16}
          sheenColor="#ffffff"
        />
      </RoundedBox>
      <PipFaces />
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
  const physics = useRef<DicePhysicsState | null>(null)
  const previousHeld = useRef([...held])
  const rollNonceRef = useRef(rollNonce)
  const rollingRef = useRef(rolling)
  const valuesRef = useRef(values)
  const heldRef = useRef(held)
  const onRollCompleteRef = useRef(onRollComplete)
  const reducedMotion = useRef(typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  useEffect(() => {
    rollNonceRef.current = rollNonce
    rollingRef.current = rolling
    valuesRef.current = values
    heldRef.current = held
    onRollCompleteRef.current = onRollComplete
  }, [held, onRollComplete, rollNonce, rolling, values])

  useEffect(() => {
    let cancelled = false
    void initializeRapier().then(() => {
      if (cancelled) return
      const state = createPhysicsState(valuesRef.current, heldRef.current)
      physics.current = state
      state.bodies.forEach((body, index) => {
        const group = groups.current[index]
        if (!group) return
        const position = body.translation()
        const rotation = body.rotation()
        group.position.set(position.x, position.y, position.z)
        group.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w)
      })
      if (rollingRef.current && rollNonceRef.current > 0) {
        launchPhysicsRoll(
          state,
          rollNonceRef.current,
          valuesRef.current,
          heldRef.current,
          reducedMotion.current,
        )
      }
    })

    return () => {
      cancelled = true
      physics.current?.world.free()
      physics.current = null
    }
  }, [])

  useEffect(() => {
    const state = physics.current
    if (!state || !rolling || rollNonce === 0) return
    launchPhysicsRoll(state, rollNonce, values, held, reducedMotion.current)
  }, [held, rollNonce, rolling, values])

  useEffect(() => {
    const state = physics.current
    if (!state || rolling) {
      previousHeld.current = [...held]
      return
    }
    held.forEach((isHeld, index) => {
      if (isHeld === previousHeld.current[index]) return
      placeIdleBody(state.bodies[index], index, values[index], isHeld)
    })
    previousHeld.current = [...held]
  }, [held, rolling, values])

  useEffect(() => () => { document.body.style.cursor = '' }, [])

  useFrame((_, rawDelta) => {
    const state = physics.current
    if (!state) return

    let simulatedTime = 0
    if (state.active) {
      state.accumulator = Math.min(state.accumulator + Math.min(rawDelta, MAX_FRAME_DELTA), MAX_FRAME_DELTA)
      while (state.accumulator >= FIXED_TIMESTEP) {
        state.world.step()
        state.accumulator -= FIXED_TIMESTEP
        simulatedTime += FIXED_TIMESTEP
      }
      state.elapsed += simulatedTime
    }

    state.bodies.forEach((body, index) => {
      const group = groups.current[index]
      if (!group) return
      const position = body.translation()
      const rotation = body.rotation()
      group.position.set(position.x, position.y, position.z)
      group.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w)
    })

    if (!state.active || state.elapsed < MIN_ROLL_TIME) return

    const settled = state.bodies.map((body, index) => {
      if (heldRef.current[index]) return true
      const linearVelocity = body.linvel()
      const angularVelocity = body.angvel()
      const isStable = body.isSleeping()
        || ((linearVelocity.x ** 2 + linearVelocity.y ** 2 + linearVelocity.z ** 2) < LINEAR_STABLE_SPEED_SQUARED
          && (angularVelocity.x ** 2 + angularVelocity.y ** 2 + angularVelocity.z ** 2) < ANGULAR_STABLE_SPEED_SQUARED)
      state.stableFor[index] = isStable ? state.stableFor[index] + simulatedTime : 0
      return body.isSleeping() || state.stableFor[index] >= REQUIRED_STABLE_TIME
    }).every(Boolean)
    const timedOutOnTray = state.elapsed >= MAX_ROLL_TIME
      && state.bodies.every((body, index) => heldRef.current[index] || body.translation().y < 0.9)
    if (!settled && !timedOutOnTray) return

    state.active = false
    state.bodies.forEach((body, index) => {
      if (!heldRef.current[index]) body.sleep()
    })
    const nextValues = valuesRef.current.map((value, index) => {
      if (heldRef.current[index]) return value
      const rotation = state.bodies[index].rotation()
      return topFaceFromQuaternion(new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w))
    })
    onRollCompleteRef.current(nextValues)
  })

  return values.map((_, index) => (
    <group
      key={index}
      ref={(node) => { groups.current[index] = node }}
      position={[FREE_REST_SLOTS[index][0], REST_CENTER_Y, FREE_REST_SLOTS[index][1]]}
      visible={!held[index]}
      onClick={(event) => { event.stopPropagation(); onToggle(index) }}
      onPointerEnter={(event) => { event.stopPropagation(); document.body.style.cursor = 'pointer' }}
      onPointerLeave={() => { document.body.style.cursor = '' }}
    >
      <DieVisual />
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

const celebrationStyle: Record<YachtCelebrationTier, { color: string; particles: number; strength: number }> = {
  rare: { color: '#8bd6ff', particles: 70, strength: 0.72 },
  epic: { color: '#66d8ac', particles: 105, strength: 0.88 },
  legendary: { color: '#f2c65d', particles: 145, strength: 1 },
}

function CelebrationEffects({ celebration }: { celebration: YachtCelebrationEvent }) {
  const group = useRef<Group>(null)
  const innerRing = useRef<MeshBasicMaterial>(null)
  const outerRing = useRef<MeshBasicMaterial>(null)
  const burstLight = useRef<PointLight>(null)
  const elapsed = useRef(0)
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const style = celebrationStyle[celebration.tier]

  useFrame((_, delta) => {
    if (!group.current) return
    if (reducedMotion) {
      group.current.scale.setScalar(1.1)
      if (innerRing.current) innerRing.current.opacity = 0.42
      if (outerRing.current) outerRing.current.opacity = 0.22
      if (burstLight.current) burstLight.current.intensity = 3.5 * style.strength
      return
    }

    elapsed.current = Math.min(elapsed.current + delta, CELEBRATION_DURATION)
    const progress = elapsed.current / CELEBRATION_DURATION
    const envelope = Math.sin(Math.PI * progress)
    group.current.visible = progress < 1
    group.current.rotation.y += delta * (0.55 + style.strength * 0.55)
    group.current.scale.setScalar(0.62 + progress * 1.85)
    if (innerRing.current) innerRing.current.opacity = envelope * 0.92
    if (outerRing.current) outerRing.current.opacity = envelope * 0.54
    if (burstLight.current) burstLight.current.intensity = envelope * 16 * style.strength
  })

  return (
    <group ref={group} position={[0, 0.92, 0]}>
      <pointLight ref={burstLight} color={style.color} distance={12} decay={1.8} />
      <Sparkles
        count={style.particles}
        color={style.color}
        opacity={0.95}
        scale={[6.8, 2.6, 3.1]}
        size={celebration.tier === 'legendary' ? 6.2 : 4.8}
        speed={reducedMotion ? 0 : 2.1}
        noise={[1.25, 1.7, 1.25]}
      />
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.25, 0.035, 12, 72]} />
        <meshBasicMaterial ref={innerRing} color={style.color} transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.75, 0.018, 10, 72]} />
        <meshBasicMaterial ref={outerRing} color="#ffffff" transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}

function ResponsiveCamera({ celebration }: { celebration: YachtCelebrationEvent | null }) {
  const { camera, size } = useThree()
  const basePosition = useRef({ y: 6.65, z: 7.55 })
  const celebrationElapsed = useRef(CELEBRATION_DURATION)
  const reducedMotion = useRef(typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  useLayoutEffect(() => {
    const aspect = size.width / Math.max(size.height, 1)
    const distanceScale = Math.max(1, Math.min(1.75, 0.96 / aspect))
    basePosition.current = { y: 0.15 + 6.5 * distanceScale, z: 7.55 * distanceScale }
    camera.position.set(0, basePosition.current.y, basePosition.current.z)
    camera.lookAt(0, 0.15, 0)
    camera.updateProjectionMatrix()
  }, [camera, size.height, size.width])

  useEffect(() => {
    celebrationElapsed.current = celebration ? 0 : CELEBRATION_DURATION
    if (celebration) return
    camera.position.set(0, basePosition.current.y, basePosition.current.z)
    camera.lookAt(0, 0.15, 0)
  }, [camera, celebration])

  useFrame((_, delta) => {
    if (!celebration || reducedMotion.current || celebrationElapsed.current >= CELEBRATION_DURATION) return
    celebrationElapsed.current = Math.min(celebrationElapsed.current + delta, CELEBRATION_DURATION)
    const progress = celebrationElapsed.current / CELEBRATION_DURATION
    const envelope = Math.sin(Math.PI * progress)
    const strength = celebrationStyle[celebration.tier].strength
    camera.position.set(
      0,
      basePosition.current.y - (0.22 + Math.sin(progress * Math.PI * 2) * 0.06) * strength * envelope,
      basePosition.current.z + 0.62 * strength * envelope,
    )
    camera.lookAt(0, 0.15 + 0.2 * strength * envelope, 0)
  })

  return null
}

export function DiceScene({ values, held, rolling, rollNonce, celebration, onToggle, onRollComplete }: {
  values: number[]
  held: boolean[]
  rolling: boolean
  rollNonce: number
  celebration: YachtCelebrationEvent | null
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
      <ResponsiveCamera celebration={celebration} />
      <DiceTray />
      <DiceBodies
        values={values}
        held={held}
        rolling={rolling}
        rollNonce={rollNonce}
        onToggle={onToggle}
        onRollComplete={onRollComplete}
      />
      {celebration && <CelebrationEffects key={celebration.id} celebration={celebration} />}
      <ContactShadows position={[0, FELT_TOP_Y + 0.002, 0]} scale={10} opacity={0.14} blur={4.2} far={1.35} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.52, 0]} receiveShadow>
        <planeGeometry args={[35, 35]} /><meshStandardMaterial color="#0e1210" roughness={1} />
      </mesh>
    </Canvas>
  )
}
