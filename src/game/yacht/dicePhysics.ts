import { Quaternion, Vector3 } from 'three'

const UP = new Vector3(0, 1, 0)
const FACE_NORMALS: ReadonlyArray<{ value: number; normal: Vector3 }> = [
  { value: 1, normal: new Vector3(0, 1, 0) },
  { value: 6, normal: new Vector3(0, -1, 0) },
  { value: 2, normal: new Vector3(0, 0, 1) },
  { value: 5, normal: new Vector3(0, 0, -1) },
  { value: 3, normal: new Vector3(1, 0, 0) },
  { value: 4, normal: new Vector3(-1, 0, 0) },
]

export function quaternionForTopFace(value: number, yaw = 0) {
  const face = new Quaternion()
  if (value === 6) face.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI)
  if (value === 2) face.setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2)
  if (value === 5) face.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2)
  if (value === 3) face.setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2)
  if (value === 4) face.setFromAxisAngle(new Vector3(0, 0, 1), -Math.PI / 2)
  return new Quaternion().setFromAxisAngle(UP, yaw).multiply(face)
}

export function topFaceFromQuaternion(quaternion: Quaternion) {
  const worldNormal = new Vector3()
  let topValue = 1
  let highestDot = -Infinity

  for (const face of FACE_NORMALS) {
    const dot = worldNormal.copy(face.normal).applyQuaternion(quaternion).dot(UP)
    if (dot > highestDot) {
      highestDot = dot
      topValue = face.value
    }
  }

  return topValue
}

export function uprightQuaternionForTopFace(quaternion: Quaternion) {
  const value = topFaceFromQuaternion(quaternion)
  const localNormal = FACE_NORMALS.find((face) => face.value === value)?.normal ?? FACE_NORMALS[0].normal
  const worldNormal = localNormal.clone().applyQuaternion(quaternion).normalize()
  const correction = new Quaternion().setFromUnitVectors(worldNormal, UP)
  return correction.multiply(quaternion.clone()).normalize()
}

export function dieHalfExtents(
  quaternion: Quaternion,
  halfSize = 0.5,
  target = new Vector3(),
) {
  const xAxis = new Vector3(1, 0, 0).applyQuaternion(quaternion)
  const yAxis = new Vector3(0, 1, 0).applyQuaternion(quaternion)
  const zAxis = new Vector3(0, 0, 1).applyQuaternion(quaternion)

  return target.set(
    halfSize * (Math.abs(xAxis.x) + Math.abs(yAxis.x) + Math.abs(zAxis.x)),
    halfSize * (Math.abs(xAxis.y) + Math.abs(yAxis.y) + Math.abs(zAxis.y)),
    halfSize * (Math.abs(xAxis.z) + Math.abs(yAxis.z) + Math.abs(zAxis.z)),
  )
}
