import { ContactShadows, RoundedBox } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { forwardRef, useImperativeHandle, useMemo, useRef, type RefObject } from 'react'
import { Group, Mesh, Object3D, Quaternion, Vector3 } from 'three'
import {
  applyShot,
  areBallsStopped,
  createInitialBalls,
  evaluateShot,
  stepPhysics,
  TABLE,
  type BallState,
  type BilliardsMode,
  type ShotEvent,
  type ShotVerdict,
  type Vec2,
} from './engine'

export type StrokeStyle = 'push' | 'normal' | 'punch'

export interface ShotSettings {
  angle: number
  power: number
  spin: Vec2
  stroke: StrokeStyle
}

export interface BilliardsSceneHandle {
  shoot: (settings: ShotSettings) => boolean
  reset: () => void
}

interface SceneProps {
  mode: BilliardsMode
  view: 'overview' | 'aim'
  angle: number
  onShotStart: () => void
  onShotLaunched: () => void
  onShotEnd: (verdict: ShotVerdict, events: ShotEvent[]) => void
}

interface ControllerBridge {
  shoot: (settings: ShotSettings) => boolean
  reset: () => void
}

function CameraRig({ view, angle, balls }: { view: SceneProps['view']; angle: number; balls: RefObject<BallState[]> }) {
  const { camera } = useThree()
  const targetObject = useMemo(() => new Object3D(), [])
  const targetPosition = useMemo(() => new Vector3(), [])
  const lookTarget = useMemo(() => new Vector3(), [])

  useFrame((_, delta) => {
    const cue = balls.current?.find((ball) => ball.id === 'cue')
    if (!cue) return
    const speed = 1 - Math.exp(-delta * 5.5)
    if (view === 'aim') {
      targetPosition.set(
        cue.position.x - Math.cos(angle) * 1.3,
        0.94,
        cue.position.y - Math.sin(angle) * 1.3,
      )
      lookTarget.set(cue.position.x + Math.cos(angle) * 3.2, 0.2, cue.position.y + Math.sin(angle) * 3.2)
    } else {
      targetPosition.set(0, 8.2, 6.25)
      lookTarget.set(0, 0.05, 0)
    }
    camera.position.lerp(targetPosition, speed)
    targetObject.position.copy(camera.position)
    targetObject.lookAt(lookTarget)
    camera.quaternion.slerp(targetObject.quaternion, speed)
    camera.updateProjectionMatrix()
  })
  return null
}

function Table() {
  const diamonds = [-4, -3, -2, -1, 0, 1, 2, 3, 4]
  return (
    <group>
      <RoundedBox args={[11.25, 0.72, 6.25]} radius={0.22} smoothness={4} position={[0, -0.34, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#261812" roughness={0.38} metalness={0.08} />
      </RoundedBox>
      <mesh position={[0, 0, 0]} receiveShadow>
        <boxGeometry args={[10, 0.18, 5]} />
        <meshStandardMaterial color="#0c624c" roughness={0.88} />
      </mesh>
      <mesh position={[0, 0.22, 2.69]} castShadow>
        <boxGeometry args={[10.9, 0.46, 0.42]} />
        <meshStandardMaterial color="#173e32" roughness={0.62} />
      </mesh>
      <mesh position={[0, 0.22, -2.69]} castShadow>
        <boxGeometry args={[10.9, 0.46, 0.42]} />
        <meshStandardMaterial color="#173e32" roughness={0.62} />
      </mesh>
      <mesh position={[5.19, 0.22, 0]} castShadow>
        <boxGeometry args={[0.42, 0.46, 5.8]} />
        <meshStandardMaterial color="#173e32" roughness={0.62} />
      </mesh>
      <mesh position={[-5.19, 0.22, 0]} castShadow>
        <boxGeometry args={[0.42, 0.46, 5.8]} />
        <meshStandardMaterial color="#173e32" roughness={0.62} />
      </mesh>
      {diamonds.map((x) => (
        <group key={x}>
          <mesh position={[x * 1.08, 0.47, 2.88]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
            <planeGeometry args={[0.09, 0.09]} /><meshStandardMaterial color="#d9bd78" metalness={0.65} roughness={0.25} />
          </mesh>
          <mesh position={[x * 1.08, 0.47, -2.88]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
            <planeGeometry args={[0.09, 0.09]} /><meshStandardMaterial color="#d9bd78" metalness={0.65} roughness={0.25} />
          </mesh>
        </group>
      ))}
      {[-1.6, -0.8, 0, 0.8, 1.6].map((z) => (
        <group key={z}>
          <mesh position={[5.39, 0.47, z]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
            <planeGeometry args={[0.09, 0.09]} /><meshStandardMaterial color="#d9bd78" metalness={0.65} roughness={0.25} />
          </mesh>
          <mesh position={[-5.39, 0.47, z]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
            <planeGeometry args={[0.09, 0.09]} /><meshStandardMaterial color="#d9bd78" metalness={0.65} roughness={0.25} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Ball({ id, color, meshRef }: { id: BallState['id']; color: string; meshRef: (mesh: Mesh | null) => void }) {
  return (
    <group>
      <mesh ref={meshRef} castShadow>
        <sphereGeometry args={[TABLE.ballRadius, 48, 32]} />
        <meshPhysicalMaterial color={color} roughness={0.19} clearcoat={1} clearcoatRoughness={0.13} />
        {id === 'cue' && (
          <mesh position={[0, TABLE.ballRadius * 0.97, 0]}>
            <circleGeometry args={[0.025, 16]} /><meshBasicMaterial color="#c94b3f" />
          </mesh>
        )}
      </mesh>
    </group>
  )
}

function Cue({ balls, active, angle, visible, pullRef }: { balls: RefObject<BallState[]>; active: RefObject<boolean>; angle: number; visible: boolean; pullRef: RefObject<number> }) {
  const ref = useRef<Group>(null)
  const quaternion = useMemo(() => new Quaternion(), [])
  const direction = useMemo(() => new Vector3(), [])

  useFrame(() => {
    if (!ref.current) return
    const cue = balls.current?.[0]
    if (!cue) return
    direction.set(Math.cos(angle), 0, Math.sin(angle)).normalize()
    quaternion.setFromUnitVectors(new Vector3(0, 1, 0), direction)
    const pull = pullRef.current ?? 0
    ref.current.position.set(
      cue.position.x - Math.cos(angle) * (1.78 + pull),
      0.29,
      cue.position.y - Math.sin(angle) * (1.78 + pull),
    )
    ref.current.quaternion.copy(quaternion)
    ref.current.visible = visible && !active.current
  })

  return (
    <group ref={ref}>
      <mesh castShadow>
        <cylinderGeometry args={[0.028, 0.046, 3.05, 18]} />
        <meshStandardMaterial color="#c99650" roughness={0.34} />
      </mesh>
      <mesh position={[0, 1.51, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.08, 16]} />
        <meshStandardMaterial color="#6ca8a1" roughness={0.7} />
      </mesh>
    </group>
  )
}

function AimGuide({ balls, active, angle, visible }: { balls: RefObject<BallState[]>; active: RefObject<boolean>; angle: number; visible: boolean }) {
  const ref = useRef<Mesh>(null)
  useFrame(() => {
    const cue = balls.current?.[0]
    if (!cue || !ref.current) return
    ref.current.visible = visible && !active.current
    ref.current.position.set(cue.position.x + Math.cos(angle) * 3.5, 0.315, cue.position.y + Math.sin(angle) * 3.5)
    ref.current.rotation.y = -angle
  })
  return (
    <mesh ref={ref}>
      <boxGeometry args={[7, 0.008, 0.012]} />
      <meshBasicMaterial color="#dce7cc" transparent opacity={0.32} />
    </mesh>
  )
}

function World({ mode, view, angle, onShotStart, onShotLaunched, onShotEnd, controller }: SceneProps & { controller: RefObject<ControllerBridge | null> }) {
  const balls = useRef<BallState[]>(createInitialBalls(mode))
  const meshMap = useRef(new Map<string, Mesh>())
  const events = useRef<ShotEvent[]>([])
  const active = useRef(false)
  const restFrames = useRef(0)
  const pullRef = useRef(0)
  const animation = useRef<{ elapsed: number; duration: number; settings: ShotSettings } | null>(null)
  const renderBalls = mode === 'four-ball'
    ? [
        { id: 'cue' as const, color: '#f7f3e8' }, { id: 'yellow' as const, color: '#f4c94d' },
        { id: 'red' as const, color: '#d94236' }, { id: 'red2' as const, color: '#e65848' },
      ]
    : [
        { id: 'cue' as const, color: '#f7f3e8' }, { id: 'yellow' as const, color: '#f4c94d' }, { id: 'red' as const, color: '#d94236' },
      ]

  useImperativeHandle(controller, () => ({
    shoot(settings) {
      if (active.current || animation.current) return false
      const duration = settings.stroke === 'push' ? 0.72 : settings.stroke === 'punch' ? 0.34 : 0.52
      animation.current = { elapsed: 0, duration, settings }
      onShotStart()
      return true
    },
    reset() {
      const fresh = createInitialBalls(mode)
      balls.current.forEach((ball, index) => Object.assign(ball, fresh[index]))
      events.current = []
      active.current = false
      animation.current = null
      pullRef.current = 0
      restFrames.current = 0
    },
  }), [mode, onShotStart])

  useFrame((_, rawDelta) => {
    if (animation.current) {
      const shot = animation.current
      shot.elapsed += Math.min(rawDelta, 0.05)
      const progress = shot.elapsed / shot.duration
      pullRef.current = progress < 0.62
        ? Math.sin((progress / 0.62) * Math.PI * 0.5) * 0.72
        : Math.max(0, (1 - progress) * 0.24)
      if (progress >= 1) {
        applyShot(balls.current[0], shot.settings.angle, shot.settings.power, shot.settings.spin, shot.settings.stroke)
        animation.current = null
        pullRef.current = 0
        active.current = true
        events.current = []
        onShotLaunched()
      }
    }

    if (active.current) {
      const delta = Math.min(rawDelta, 1 / 24)
      for (let substep = 0; substep < 3; substep += 1) {
        stepPhysics(balls.current, delta / 3, (event) => events.current.push(event))
      }
      if (areBallsStopped(balls.current)) {
        restFrames.current += 1
        if (restFrames.current > 8) {
          active.current = false
          restFrames.current = 0
          const snapshot = [...events.current]
          onShotEnd(evaluateShot(mode, snapshot), snapshot)
        }
      } else {
        restFrames.current = 0
      }
    }

    for (const ball of balls.current) {
      const mesh = meshMap.current.get(ball.id)
      if (!mesh) continue
      mesh.position.set(ball.position.x, TABLE.ballRadius + 0.1, ball.position.y)
      const speed = Math.hypot(ball.velocity.x, ball.velocity.y)
      if (speed > 0) mesh.rotation.z -= speed * rawDelta / TABLE.ballRadius
    }
  })

  return (
    <>
      <CameraRig view={view} angle={angle} balls={balls} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[2, 8, 4]} intensity={2.2} castShadow shadow-mapSize={[1024, 1024]} />
      <pointLight position={[-4, 4, -3]} color="#68cbb3" intensity={5} distance={12} />
      <Table />
      {renderBalls.map((ball) => (
        <Ball key={ball.id} id={ball.id} color={ball.color} meshRef={(mesh) => { if (mesh) meshMap.current.set(ball.id, mesh) }} />
      ))}
      <AimGuide balls={balls} active={active} angle={angle} visible={view === 'aim'} />
      <Cue balls={balls} active={active} angle={angle} visible={view === 'aim'} pullRef={pullRef} />
      <ContactShadows position={[0, -0.72, 0]} opacity={0.45} scale={18} blur={2.5} far={8} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.72, 0]} receiveShadow>
        <planeGeometry args={[45, 45]} /><meshStandardMaterial color="#06100d" roughness={1} />
      </mesh>
    </>
  )
}

export const BilliardsScene = forwardRef<BilliardsSceneHandle, SceneProps>(function BilliardsScene(props, ref) {
  const controller = useRef<ControllerBridge | null>(null)
  useImperativeHandle(ref, () => ({
    shoot: (settings) => controller.current?.shoot(settings) ?? false,
    reset: () => controller.current?.reset(),
  }), [])

  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{ position: [0, 8.2, 6.25], fov: 48, near: 0.1, far: 100 }}
      gl={{ antialias: true, powerPreference: 'default' }}
      fallback={<div className="webgl-fallback">3D 화면을 불러올 수 없습니다. 브라우저의 WebGL 설정을 확인해 주세요.</div>}
    >
      <color attach="background" args={['#07120e']} />
      <fog attach="fog" args={['#07120e', 10, 28]} />
      <World {...props} controller={controller} />
    </Canvas>
  )
})
