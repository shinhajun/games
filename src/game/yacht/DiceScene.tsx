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

function Die({ index, value, held, rolling, rollNonce, onToggle }: {
  index: number
  value: number
  held: boolean
  rolling: boolean
  rollNonce: number
  onToggle: () => void
}) {
  const group = useRef<Group>(null)
  const progress = useRef(0)
  const yaw = useRef(index * 0.27)
  const target = useMemo(() => new Quaternion(), [])
  const baseX = (index - 2) * 1.34

  useEffect(() => {
    if (!held) {
      progress.current = 0
      yaw.current = ((rollNonce * 0.73 + index * 0.39) % 2) * Math.PI
    }
  }, [held, index, rollNonce])

  useFrame((_, delta) => {
    if (!group.current) return
    if (rolling && !held) {
      progress.current += delta
      group.current.rotation.x += delta * (8.5 + index * 0.62)
      group.current.rotation.y += delta * (10.2 - index * 0.45)
      group.current.rotation.z += delta * (6.7 + index * 0.33)
      group.current.position.y = 0.62 + Math.abs(Math.sin(progress.current * 8 + index)) * 1.7
      group.current.position.x = baseX + Math.sin(progress.current * 5 + index) * 0.18
      group.current.position.z = Math.cos(progress.current * 4 + index) * 0.23
    } else {
      target.copy(targetQuaternion(value, yaw.current))
      group.current.quaternion.slerp(target, 1 - Math.exp(-delta * 9))
      group.current.position.x += (baseX - group.current.position.x) * (1 - Math.exp(-delta * 8))
      group.current.position.y += ((held ? 0.92 : 0.58) - group.current.position.y) * (1 - Math.exp(-delta * 8))
      group.current.position.z += ((held ? -0.16 : 0) - group.current.position.z) * (1 - Math.exp(-delta * 8))
    }
  })

  return (
    <group
      ref={group}
      position={[baseX, 0.58, 0]}
      onClick={(event) => { event.stopPropagation(); onToggle() }}
      onPointerEnter={() => { document.body.style.cursor = 'pointer' }}
      onPointerLeave={() => { document.body.style.cursor = '' }}
    >
      <RoundedBox args={[1, 1, 1]} radius={0.13} smoothness={5} castShadow>
        <meshPhysicalMaterial color={held ? '#f3c96a' : '#f3efe5'} roughness={0.26} clearcoat={0.7} clearcoatRoughness={0.2} />
      </RoundedBox>
      <PipFaces />
      {held && (
        <mesh position={[0, -0.64, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.48, 0.57, 40]} />
          <meshBasicMaterial color="#f2c65d" transparent opacity={0.6} />
        </mesh>
      )}
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
    <Canvas shadows dpr={[1, 1.8]} camera={{ position: [0, 6.7, 7.6], fov: 39, near: 0.1, far: 50 }} gl={{ antialias: true, powerPreference: 'high-performance' }}>
      <color attach="background" args={['#10120f']} />
      <fog attach="fog" args={['#10120f', 10, 23]} />
      <ambientLight intensity={0.8} />
      <directionalLight castShadow position={[-2, 7, 4]} intensity={2.6} shadow-mapSize={[1024, 1024]} />
      <pointLight position={[4, 3, -2]} intensity={10} distance={9} color="#f3bf50" />
      <pointLight position={[-4, 2, 1]} intensity={7} distance={8} color="#4ec59a" />
      <RoundedBox args={[8.4, 0.5, 3.25]} radius={0.24} smoothness={5} position={[0, -0.24, 0]} receiveShadow>
        <meshStandardMaterial color="#242a24" roughness={0.66} />
      </RoundedBox>
      <RoundedBox args={[7.72, 0.12, 2.58]} radius={0.18} smoothness={4} position={[0, 0.05, 0]} receiveShadow>
        <meshStandardMaterial color="#153e32" roughness={0.84} />
      </RoundedBox>
      {values.map((value, index) => (
        <Die key={index} index={index} value={value} held={held[index]} rolling={rolling} rollNonce={rollNonce} onToggle={() => onToggle(index)} />
      ))}
      <ContactShadows position={[0, 0.1, 0]} scale={11} opacity={0.68} blur={2.4} far={3.2} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.52, 0]} receiveShadow>
        <planeGeometry args={[35, 35]} /><meshStandardMaterial color="#10120f" roughness={1} />
      </mesh>
    </Canvas>
  )
}
