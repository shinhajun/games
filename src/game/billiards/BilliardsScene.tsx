import { ContactShadows, RoundedBox } from '@react-three/drei'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { DoubleSide, Group, Matrix4, Mesh, PerspectiveCamera, Quaternion, Vector3 } from 'three'
import {
  applyShot,
  areBallsStopped,
  areBallsTranslationallyStopped,
  createInitialBalls,
  cueContactGeometry,
  evaluateShot,
  getTableSpec,
  PHYSICS,
  settleResidualSideSpin,
  shotKinematics,
  stepPhysics,
  type BallState,
  type BilliardsMode,
  type ShotEvent,
  type ShotVerdict,
  type TableSpec,
  type Vec2,
} from './engine'

export type StrokeStyle = import('./engine').StrokeStyle

export interface ShotSettings {
  angle: number
  power: number
  spin: Vec2
  stroke: StrokeStyle
  elevation: number
}

export interface BilliardsSceneHandle {
  shoot: (settings: ShotSettings, pull?: number) => boolean
  reset: () => void
}

interface SceneProps {
  mode: BilliardsMode
  view: 'overview' | 'aim'
  angle: number
  elevation: number
  power: number
  spin: Vec2
  stroke: StrokeStyle
  manualPull: number
  onAimSelected: (angle: number) => void
  onSpinSelected: (spin: Vec2) => void
  onShotStart: () => void
  onShotLaunched: () => void
  onShotEnd: (verdict: ShotVerdict, events: ShotEvent[]) => void
}

interface ControllerBridge {
  shoot: (settings: ShotSettings, pull?: number) => boolean
  reset: () => void
}

const WORLD_SCALE = 3.5
const CLOTH_THICKNESS = 0.035 * WORLD_SCALE
const CLOTH_TOP = CLOTH_THICKNESS / 2
const PHYSICS_STEP = 1 / 240
const FLOOR_Y = -0.7 * WORLD_SCALE
const MAX_CUE_PULL = 0.3 * WORLD_SCALE

function world(metres: number) {
  return metres * WORLD_SCALE
}

function overviewCamera(spec: TableSpec, aspect = 1.5): [number, number, number] {
  const length = world(spec.playingLength)
  if (aspect < 0.78) {
    const portraitDistance = Math.max(1, 0.73 / aspect)
    return [length * 0.625 * portraitDistance, length * 0.82 * portraitDistance, 0]
  }
  const portraitDistance = Math.max(1, 1.48 / aspect)
  return [0, length * 0.82 * portraitDistance, length * 0.625 * portraitDistance]
}

function CameraRig({ mode, view, angle, elevation, balls }: { mode: BilliardsMode; view: SceneProps['view']; angle: number; elevation: number; balls: RefObject<BallState[]> }) {
  const { camera, size } = useThree()
  const spec = getTableSpec(mode)
  const initialPosition = useMemo(
    () => overviewCamera(spec, size.width / Math.max(size.height, 1)),
    [size.height, size.width, spec],
  )
  const targetPosition = useMemo(() => new Vector3(), [])
  const lookTarget = useMemo(() => new Vector3(), [])
  const smoothedLookTarget = useMemo(() => new Vector3(0, CLOTH_TOP, 0), [])

  useLayoutEffect(() => {
    camera.position.set(...initialPosition)
    smoothedLookTarget.set(0, CLOTH_TOP, 0)
    camera.lookAt(smoothedLookTarget)
    camera.updateProjectionMatrix()
  }, [camera, initialPosition, smoothedLookTarget])

  useFrame((_, delta) => {
    const cue = balls.current?.find((ball) => ball.id === 'cue')
    if (!cue) return
    const smoothing = 1 - Math.exp(-delta * 5.5)
    const compactAim = size.width <= 520 || size.height <= 680
    if (view === 'aim') {
      const behind = world(compactAim ? 0.48 : 0.62)
      const lookAhead = world(compactAim ? 0.2 : 0.42)
      const eyeHeight = world(compactAim ? 0.22 : 0.28)
      const ballRadius = world(spec.ballDiameter / 2)
      const elevationRadians = Math.min(PHYSICS.maximumCueElevation, Math.max(0, elevation)) * Math.PI / 180
      const elevatedLookAhead = lookAhead * (1 - 0.72 * elevationRadians / (PHYSICS.maximumCueElevation * Math.PI / 180))
      const raisedCueHeight = Math.tan(elevationRadians) * behind
      targetPosition.set(
        world(cue.position.x) - Math.cos(angle) * behind,
        CLOTH_TOP + ballRadius + raisedCueHeight + eyeHeight,
        world(cue.position.y) - Math.sin(angle) * behind,
      )
      lookTarget.set(
        world(cue.position.x) + Math.cos(angle) * elevatedLookAhead,
        CLOTH_TOP + ballRadius,
        world(cue.position.y) + Math.sin(angle) * elevatedLookAhead,
      )
    } else {
      targetPosition.set(...initialPosition)
      lookTarget.set(0, CLOTH_TOP, 0)
    }
    camera.position.lerp(targetPosition, smoothing)
    smoothedLookTarget.lerp(lookTarget, smoothing)
    if (camera instanceof PerspectiveCamera) {
      const targetFov = view === 'aim' ? (compactAim ? 39 : 43) : 48
      const targetFocalLength = 0.5 * camera.getFilmHeight() / Math.tan(targetFov * Math.PI / 360)
      const focalLength = camera.getFocalLength()
      camera.setFocalLength(focalLength + (targetFocalLength - focalLength) * smoothing)
    }
    camera.lookAt(smoothedLookTarget)
    camera.updateProjectionMatrix()
  })
  return null
}

function Table({ spec }: { spec: TableSpec }) {
  const playingLength = world(spec.playingLength)
  const playingWidth = world(spec.playingWidth)
  const frameWidth = world(spec.frameWidth)
  const cushionDepth = world(0.05)
  const cushionHeight = world(0.075)
  const cushionNoseY = CLOTH_TOP + world(spec.cushionNoseHeight)
  const cushionNoseSize = world(0.008)
  const baseHeight = world(0.18)
  const outerLength = playingLength + 2 * (frameWidth + cushionDepth)
  const outerWidth = playingWidth + 2 * (frameWidth + cushionDepth)
  const longRailLength = playingLength + 2 * cushionDepth
  const shortRailLength = playingWidth + 2 * cushionDepth
  const longRailZ = playingWidth / 2 + cushionDepth / 2
  const shortRailX = playingLength / 2 + cushionDepth / 2
  const railY = CLOTH_TOP + cushionHeight / 2
  const markerY = CLOTH_TOP + cushionHeight + 0.01
  const longMarkerZ = playingWidth / 2 + cushionDepth + frameWidth * 0.48
  const shortMarkerX = playingLength / 2 + cushionDepth + frameWidth * 0.48
  const diamondSize = world(0.025)
  const legWidth = world(0.16)
  const legHeight = Math.abs(FLOOR_Y) - baseHeight
  const legY = -baseHeight - legHeight / 2
  const legX = playingLength * 0.34
  const legZ = playingWidth * 0.31
  const longDiamonds = Array.from({ length: 9 }, (_, index) => (index - 4) * playingLength / 8)
  const shortDiamonds = Array.from({ length: 5 }, (_, index) => (index - 2) * playingWidth / 4)

  return (
    <group>
      <RoundedBox args={[outerLength, baseHeight, outerWidth]} radius={world(0.06)} smoothness={4} position={[0, -baseHeight / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#261812" roughness={0.38} metalness={0.08} />
      </RoundedBox>
      <mesh position={[0, 0, 0]} receiveShadow>
        <boxGeometry args={[playingLength, CLOTH_THICKNESS, playingWidth]} />
        <meshStandardMaterial color="#118060" roughness={0.82} />
      </mesh>
      <mesh position={[0, railY, longRailZ]} castShadow>
        <boxGeometry args={[longRailLength, cushionHeight, cushionDepth]} />
        <meshStandardMaterial color="#173e32" roughness={0.62} />
      </mesh>
      <mesh position={[0, railY, -longRailZ]} castShadow>
        <boxGeometry args={[longRailLength, cushionHeight, cushionDepth]} />
        <meshStandardMaterial color="#173e32" roughness={0.62} />
      </mesh>
      <mesh position={[shortRailX, railY, 0]} castShadow>
        <boxGeometry args={[cushionDepth, cushionHeight, shortRailLength]} />
        <meshStandardMaterial color="#173e32" roughness={0.62} />
      </mesh>
      <mesh position={[-shortRailX, railY, 0]} castShadow>
        <boxGeometry args={[cushionDepth, cushionHeight, shortRailLength]} />
        <meshStandardMaterial color="#173e32" roughness={0.62} />
      </mesh>
      <mesh position={[0, cushionNoseY, playingWidth / 2 + cushionNoseSize / 2]}>
        <boxGeometry args={[playingLength, cushionNoseSize, cushionNoseSize]} />
        <meshStandardMaterial color="#245b49" roughness={0.72} />
      </mesh>
      <mesh position={[0, cushionNoseY, -playingWidth / 2 - cushionNoseSize / 2]}>
        <boxGeometry args={[playingLength, cushionNoseSize, cushionNoseSize]} />
        <meshStandardMaterial color="#245b49" roughness={0.72} />
      </mesh>
      <mesh position={[playingLength / 2 + cushionNoseSize / 2, cushionNoseY, 0]}>
        <boxGeometry args={[cushionNoseSize, cushionNoseSize, playingWidth]} />
        <meshStandardMaterial color="#245b49" roughness={0.72} />
      </mesh>
      <mesh position={[-playingLength / 2 - cushionNoseSize / 2, cushionNoseY, 0]}>
        <boxGeometry args={[cushionNoseSize, cushionNoseSize, playingWidth]} />
        <meshStandardMaterial color="#245b49" roughness={0.72} />
      </mesh>
      {[-1, 1].flatMap((x) => [-1, 1].map((z) => (
        <RoundedBox key={`${x}-${z}`} args={[legWidth, legHeight, legWidth]} radius={world(0.025)} smoothness={3} position={[x * legX, legY, z * legZ]} castShadow>
          <meshStandardMaterial color="#211712" roughness={0.44} metalness={0.08} />
        </RoundedBox>
      )))}
      {longDiamonds.map((x) => (
        <group key={x}>
          <mesh position={[x, markerY, longMarkerZ]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
            <planeGeometry args={[diamondSize, diamondSize]} /><meshStandardMaterial color="#d9bd78" metalness={0.65} roughness={0.25} />
          </mesh>
          <mesh position={[x, markerY, -longMarkerZ]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
            <planeGeometry args={[diamondSize, diamondSize]} /><meshStandardMaterial color="#d9bd78" metalness={0.65} roughness={0.25} />
          </mesh>
        </group>
      ))}
      {shortDiamonds.map((z) => (
        <group key={z}>
          <mesh position={[shortMarkerX, markerY, z]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
            <planeGeometry args={[diamondSize, diamondSize]} /><meshStandardMaterial color="#d9bd78" metalness={0.65} roughness={0.25} />
          </mesh>
          <mesh position={[-shortMarkerX, markerY, z]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
            <planeGeometry args={[diamondSize, diamondSize]} /><meshStandardMaterial color="#d9bd78" metalness={0.65} roughness={0.25} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Ball({ id, color, radius, meshRef }: { id: BallState['id']; color: string; radius: number; meshRef: (mesh: Mesh | null) => void }) {
  return (
    <mesh ref={meshRef} castShadow>
      <sphereGeometry args={[radius, 48, 32]} />
      <meshPhysicalMaterial color={color} roughness={0.19} clearcoat={1} clearcoatRoughness={0.13} />
      {id === 'cue' && (
        <mesh position={[0, radius * 0.99, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[radius * 0.14, 16]} /><meshBasicMaterial color="#c94b3f" />
        </mesh>
      )}
    </mesh>
  )
}

function AimSurface({ spec, onAim }: { spec: TableSpec; onAim: (point: Vector3) => void }) {
  return (
    <mesh
      position={[0, CLOTH_TOP + world(spec.ballDiameter) * 1.2, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation()
        document.body.style.cursor = ''
        onAim(event.point)
      }}
      onPointerEnter={() => { document.body.style.cursor = 'crosshair' }}
      onPointerLeave={() => { document.body.style.cursor = '' }}
    >
      <planeGeometry args={[world(spec.playingLength), world(spec.playingWidth)]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}

function CueContactTarget({ spec, balls, active, angle, elevation, spin, visible, onSpinSelected }: {
  spec: TableSpec
  balls: RefObject<BallState[]>
  active: RefObject<boolean>
  angle: number
  elevation: number
  spin: Vec2
  visible: boolean
  onSpinSelected: (spin: Vec2) => void
}) {
  const targetRef = useRef<Group>(null)
  const markerRef = useRef<Mesh>(null)
  const ballRadius = world(spec.ballDiameter / 2)
  const centre = useMemo(() => new Vector3(), [])
  const side = useMemo(() => new Vector3(), [])
  const vertical = useMemo(() => new Vector3(), [])
  const back = useMemo(() => new Vector3(), [])
  const contactNormal = useMemo(() => new Vector3(), [])
  const targetMatrix = useMemo(() => new Matrix4(), [])
  const markerQuaternion = useMemo(() => new Quaternion(), [])
  const zAxis = useMemo(() => new Vector3(0, 0, 1), [])

  function updateSpin(event: ThreeEvent<PointerEvent>) {
    const cue = balls.current?.[0]
    if (!cue) return
    event.stopPropagation()
    const geometry = cueContactGeometry(angle, spin, elevation)
    centre.set(world(cue.position.x), CLOTH_TOP + ballRadius, world(cue.position.y))
    side.set(geometry.sideDirection.x, geometry.sideDirection.y, geometry.sideDirection.z)
    vertical.set(geometry.verticalDirection.x, geometry.verticalDirection.y, geometry.verticalDirection.z)
    const offset = event.point.clone().sub(centre)
    let x = offset.dot(side) / ballRadius
    let y = offset.dot(vertical) / ballRadius
    const distance = Math.hypot(x, y)
    if (distance > PHYSICS.maximumTipOffset) {
      const scale = PHYSICS.maximumTipOffset / distance
      x *= scale
      y *= scale
    }
    onSpinSelected({ x, y })
  }

  useFrame(() => {
    const cue = balls.current?.[0]
    if (!cue || !targetRef.current || !markerRef.current) return
    const geometry = cueContactGeometry(angle, spin, elevation)
    centre.set(world(cue.position.x), CLOTH_TOP + ballRadius, world(cue.position.y))
    side.set(geometry.sideDirection.x, geometry.sideDirection.y, geometry.sideDirection.z)
    vertical.set(geometry.verticalDirection.x, geometry.verticalDirection.y, geometry.verticalDirection.z)
    back.set(-geometry.cueDirection.x, -geometry.cueDirection.y, -geometry.cueDirection.z)
    contactNormal.set(geometry.contactNormal.x, geometry.contactNormal.y, geometry.contactNormal.z)
    targetMatrix.makeBasis(side, vertical, back)
    targetRef.current.position.copy(centre).addScaledVector(back, ballRadius * 1.018)
    targetRef.current.quaternion.setFromRotationMatrix(targetMatrix)
    targetRef.current.visible = visible && !active.current
    markerRef.current.position.copy(centre).addScaledVector(contactNormal, ballRadius * 1.025)
    markerQuaternion.setFromUnitVectors(zAxis, contactNormal)
    markerRef.current.quaternion.copy(markerQuaternion)
    markerRef.current.visible = visible && !active.current
  })

  return (
    <>
      <group ref={targetRef}>
        <mesh
          onPointerDown={(event) => {
            event.stopPropagation()
            event.nativeEvent.stopPropagation()
            const target = event.target as Element | null
            target?.setPointerCapture(event.pointerId)
            document.body.style.cursor = 'grabbing'
            updateSpin(event)
          }}
          onPointerMove={(event) => {
            if ((event.target as Element | null)?.hasPointerCapture(event.pointerId)) {
              event.nativeEvent.stopPropagation()
              updateSpin(event)
            }
          }}
          onPointerUp={(event) => {
            event.stopPropagation()
            event.nativeEvent.stopPropagation()
            const target = event.target as Element | null
            if (target?.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId)
            document.body.style.cursor = 'crosshair'
          }}
          onPointerCancel={(event) => {
            event.stopPropagation()
            event.nativeEvent.stopPropagation()
            const target = event.target as Element | null
            if (target?.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId)
            document.body.style.cursor = ''
          }}
          onPointerEnter={() => { document.body.style.cursor = 'crosshair' }}
          onPointerLeave={() => { document.body.style.cursor = '' }}
        >
          <circleGeometry args={[ballRadius * 0.76, 48]} />
          <meshBasicMaterial transparent opacity={0.001} depthWrite={false} depthTest={false} side={DoubleSide} />
        </mesh>
        <mesh renderOrder={20}>
          <ringGeometry args={[ballRadius * 0.68, ballRadius * 0.705, 48]} />
          <meshBasicMaterial color="#ea6955" transparent opacity={0.58} depthWrite={false} depthTest={false} side={DoubleSide} />
        </mesh>
        <mesh renderOrder={20}>
          <planeGeometry args={[ballRadius * 1.12, world(0.0012)]} />
          <meshBasicMaterial color="#ea6955" transparent opacity={0.32} depthWrite={false} depthTest={false} side={DoubleSide} />
        </mesh>
        <mesh renderOrder={20}>
          <planeGeometry args={[world(0.0012), ballRadius * 1.12]} />
          <meshBasicMaterial color="#ea6955" transparent opacity={0.32} depthWrite={false} depthTest={false} side={DoubleSide} />
        </mesh>
      </group>
      <mesh ref={markerRef} renderOrder={22}>
        <ringGeometry args={[ballRadius * 0.105, ballRadius * 0.17, 24]} />
        <meshBasicMaterial color="#f2c65d" depthWrite={false} depthTest={false} side={DoubleSide} />
      </mesh>
    </>
  )
}

function Cue({ spec, balls, active, angle, elevation, spin, visible, manualPull, pullRef }: { spec: TableSpec; balls: RefObject<BallState[]>; active: RefObject<boolean>; angle: number; elevation: number; spin: Vec2; visible: boolean; manualPull: number; pullRef: RefObject<number> }) {
  const ref = useRef<Group>(null)
  const quaternion = useMemo(() => new Quaternion(), [])
  const direction = useMemo(() => new Vector3(), [])
  const contact = useMemo(() => new Vector3(), [])
  const centre = useMemo(() => new Vector3(), [])
  const cueLength = world(1.42)
  const ballRadius = world(spec.ballDiameter / 2)
  const tipGap = world(0.018)

  useFrame(() => {
    if (!ref.current) return
    const cue = balls.current?.[0]
    if (!cue) return
    const geometry = cueContactGeometry(angle, spin, elevation)
    direction.set(geometry.cueDirection.x, geometry.cueDirection.y, geometry.cueDirection.z).normalize()
    quaternion.setFromUnitVectors(new Vector3(0, 1, 0), direction)
    const pull = (pullRef.current ?? 0) + manualPull * MAX_CUE_PULL
    centre.set(world(cue.position.x), CLOTH_TOP + ballRadius, world(cue.position.y))
    contact.set(geometry.contactNormal.x, geometry.contactNormal.y, geometry.contactNormal.z)
      .multiplyScalar(ballRadius)
      .add(centre)
    ref.current.position.copy(contact).addScaledVector(direction, -(cueLength / 2 + tipGap + pull))
    ref.current.quaternion.copy(quaternion)
    ref.current.visible = visible && !active.current
  })

  return (
    <group ref={ref}>
      <mesh castShadow>
        <cylinderGeometry args={[world(0.006), world(0.014), cueLength, 18]} />
        <meshStandardMaterial color="#c99650" roughness={0.34} />
      </mesh>
      <mesh position={[0, cueLength / 2, 0]}>
        <cylinderGeometry args={[world(0.006), world(0.006), world(0.025), 16]} />
        <meshStandardMaterial color="#6ca8a1" roughness={0.7} />
      </mesh>
    </group>
  )
}

function AimGuide({ mode, spec, balls, active, angle, elevation, power, spin, stroke, visible }: { mode: BilliardsMode; spec: TableSpec; balls: RefObject<BallState[]>; active: RefObject<boolean>; angle: number; elevation: number; power: number; spin: Vec2; stroke: StrokeStyle; visible: boolean }) {
  const ref = useRef<Mesh>(null)
  const length = world(spec.playingLength * 0.82)
  const radius = world(spec.ballDiameter / 2)
  useFrame(() => {
    const cue = balls.current?.[0]
    if (!cue || !ref.current) return
    const launchAngle = shotKinematics(mode, angle, power, spin, stroke, elevation).launchAngle
    ref.current.visible = visible && !active.current
    ref.current.position.set(
      world(cue.position.x) + Math.cos(launchAngle) * length / 2,
      CLOTH_TOP + radius + 0.015,
      world(cue.position.y) + Math.sin(launchAngle) * length / 2,
    )
    ref.current.rotation.y = -launchAngle
  })
  return (
    <mesh ref={ref}>
      <boxGeometry args={[length, 0.008, 0.012]} />
      <meshBasicMaterial color="#dce7cc" transparent opacity={0.32} />
    </mesh>
  )
}

function World({ mode, view, angle, elevation, power, spin, stroke, manualPull, onAimSelected, onSpinSelected, onShotStart, onShotLaunched, onShotEnd, controller }: SceneProps & { controller: RefObject<ControllerBridge | null> }) {
  const spec = getTableSpec(mode)
  const ballRadius = world(spec.ballDiameter / 2)
  const balls = useRef<BallState[]>(createInitialBalls(mode))
  const meshMap = useRef(new Map<string, Mesh>())
  const events = useRef<ShotEvent[]>([])
  const openingShot = useRef(true)
  const active = useRef(false)
  const [shotActive, setShotActive] = useState(false)
  const stationaryTime = useRef(0)
  const physicsAccumulator = useRef(0)
  const pullRef = useRef(0)
  const rotationAxis = useMemo(() => new Vector3(), [])
  const animation = useRef<{ elapsed: number; duration: number; initialPull: number; settings: ShotSettings } | null>(null)
  const renderBalls = mode === 'four-ball'
    ? [
        { id: 'cue' as const, color: '#f7f3e8' }, { id: 'yellow' as const, color: '#f4c94d' },
        { id: 'red' as const, color: '#d94236' }, { id: 'red2' as const, color: '#e65848' },
      ]
    : [
        { id: 'cue' as const, color: '#f7f3e8' }, { id: 'yellow' as const, color: '#f4c94d' }, { id: 'red' as const, color: '#d94236' },
      ]

  useImperativeHandle(controller, () => ({
    shoot(settings, pull = 0) {
      if (active.current || animation.current) return false
      const initialPull = Math.max(0, Math.min(1, pull))
      const duration = initialPull > 0
        ? settings.stroke === 'push' ? 0.26 : settings.stroke === 'punch' ? 0.14 : 0.2
        : settings.stroke === 'push' ? 0.72 : settings.stroke === 'punch' ? 0.34 : 0.52
      animation.current = { elapsed: 0, duration, initialPull, settings }
      setShotActive(true)
      onShotStart()
      return true
    },
    reset() {
      const fresh = createInitialBalls(mode)
      balls.current.forEach((ball, index) => Object.assign(ball, fresh[index]))
      events.current = []
      openingShot.current = true
      active.current = false
      setShotActive(false)
      animation.current = null
      physicsAccumulator.current = 0
      pullRef.current = 0
      stationaryTime.current = 0
    },
  }), [mode, onShotStart])

  useFrame((_, rawDelta) => {
    if (animation.current) {
      const shot = animation.current
      shot.elapsed += Math.min(rawDelta, 0.05)
      const progress = shot.elapsed / shot.duration
      const pullDistance = MAX_CUE_PULL
      pullRef.current = shot.initialPull > 0
        ? Math.pow(Math.max(0, 1 - progress), 2) * shot.initialPull * pullDistance
        : progress < 0.62
          ? Math.sin((progress / 0.62) * Math.PI * 0.5) * pullDistance
          : Math.max(0, (1 - progress) * pullDistance * 0.34)
      if (progress >= 1) {
        applyShot(balls.current[0], mode, shot.settings.angle, shot.settings.power, shot.settings.spin, shot.settings.stroke, shot.settings.elevation)
        animation.current = null
        physicsAccumulator.current = 0
        pullRef.current = 0
        active.current = true
        setShotActive(true)
        events.current = []
        onShotLaunched()
      }
    }

    if (active.current) {
      physicsAccumulator.current += Math.min(rawDelta, 0.05)
      let steps = 0
      while (physicsAccumulator.current >= PHYSICS_STEP && steps < 12) {
        stepPhysics(balls.current, mode, PHYSICS_STEP, (event) => events.current.push(event))
        physicsAccumulator.current -= PHYSICS_STEP
        steps += 1
      }
      if (steps === 12) physicsAccumulator.current = 0

      if (areBallsTranslationallyStopped(balls.current)) {
        stationaryTime.current += steps * PHYSICS_STEP
        const naturallyStopped = areBallsStopped(balls.current)
        const residualSpinExpired = !naturallyStopped
          && settleResidualSideSpin(balls.current, stationaryTime.current)

        if ((naturallyStopped && stationaryTime.current >= PHYSICS.restConfirmationTime) || residualSpinExpired) {
          active.current = false
          setShotActive(false)
          stationaryTime.current = 0
          const snapshot = [...events.current]
          const verdict = evaluateShot(mode, snapshot, { openingShot: openingShot.current })
          openingShot.current = false
          onShotEnd(verdict, snapshot)
        }
      } else {
        stationaryTime.current = 0
      }
    }

    for (const ball of balls.current) {
      const mesh = meshMap.current.get(ball.id)
      if (!mesh) continue
      mesh.position.set(world(ball.position.x), CLOTH_TOP + ballRadius, world(ball.position.y))
      const angularSpeed = Math.hypot(ball.angularVelocity.x, ball.angularVelocity.y, ball.angularVelocity.z)
      if (angularSpeed > 0) {
        rotationAxis.set(ball.angularVelocity.x, ball.angularVelocity.y, ball.angularVelocity.z).normalize()
        mesh.rotateOnWorldAxis(rotationAxis, angularSpeed * rawDelta)
      }
    }
  })

  const tableLength = world(spec.playingLength)
  return (
    <>
      <CameraRig mode={mode} view={view} angle={angle} elevation={elevation} balls={balls} />
      <ambientLight intensity={view === 'overview' ? 1.35 : 0.95} />
      <hemisphereLight args={['#dfffee', '#07120e', view === 'overview' ? 1.8 : 1.15]} />
      <directionalLight position={[2, 8, 4]} intensity={view === 'overview' ? 3.4 : 2.7} castShadow shadow-mapSize={[1024, 1024]} />
      <pointLight position={[-4, 4, -3]} color="#8aefd0" intensity={view === 'overview' ? 7 : 5} distance={18} />
      <Table spec={spec} />
      {view === 'overview' && !shotActive && (
        <AimSurface
          spec={spec}
          onAim={(point) => {
            const cue = balls.current[0]
            const target = { x: point.x / WORLD_SCALE, y: point.z / WORLD_SCALE }
            if (Math.hypot(target.x - cue.position.x, target.y - cue.position.y) < spec.ballDiameter) return
            onAimSelected(Math.atan2(target.y - cue.position.y, target.x - cue.position.x))
          }}
        />
      )}
      {renderBalls.map((ball) => (
        <Ball key={ball.id} id={ball.id} color={ball.color} radius={ballRadius} meshRef={(mesh) => { if (mesh) meshMap.current.set(ball.id, mesh) }} />
      ))}
      <CueContactTarget spec={spec} balls={balls} active={active} angle={angle} elevation={elevation} spin={spin} visible={view === 'aim' && !shotActive} onSpinSelected={onSpinSelected} />
      <AimGuide mode={mode} spec={spec} balls={balls} active={active} angle={angle} elevation={elevation} power={power} spin={spin} stroke={stroke} visible={view === 'aim'} />
      <Cue spec={spec} balls={balls} active={active} angle={angle} elevation={elevation} spin={spin} visible={view === 'aim'} manualPull={manualPull} pullRef={pullRef} />
      <ContactShadows position={[0, FLOOR_Y + 0.01, 0]} opacity={0.45} scale={tableLength * 1.8} blur={2.5} far={8} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_Y, 0]} receiveShadow>
        <planeGeometry args={[45, 45]} /><meshStandardMaterial color="#06100d" roughness={1} />
      </mesh>
    </>
  )
}

export const BilliardsScene = forwardRef<BilliardsSceneHandle, SceneProps>(function BilliardsScene(props, ref) {
  const controller = useRef<ControllerBridge | null>(null)
  const spec = getTableSpec(props.mode)
  const cameraPosition = overviewCamera(spec)
  useImperativeHandle(ref, () => ({
    shoot: (settings, pull) => controller.current?.shoot(settings, pull) ?? false,
    reset: () => controller.current?.reset(),
  }), [])

  return (
    <Canvas
      shadows="basic"
      dpr={[1, 1.35]}
      camera={{ position: cameraPosition, fov: 48, near: 0.1, far: 100 }}
      gl={{ antialias: true, powerPreference: 'default' }}
      fallback={<div className="webgl-fallback">3D 화면을 불러올 수 없습니다. 브라우저의 WebGL 설정을 확인해 주세요.</div>}
    >
      <color attach="background" args={['#07120e']} />
      <World {...props} controller={controller} />
    </Canvas>
  )
})
