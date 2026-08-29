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
  return readTopFace(quaternion).value
}

export function readTopFace(quaternion: Quaternion) {
  const worldNormal = new Vector3()
  let topValue = 1
  let highestDot = -Infinity
  let secondHighestDot = -Infinity

  for (const face of FACE_NORMALS) {
    const dot = worldNormal.copy(face.normal).applyQuaternion(quaternion).dot(UP)
    if (dot > highestDot) {
      secondHighestDot = highestDot
      highestDot = dot
      topValue = face.value
    } else if (dot > secondHighestDot) {
      secondHighestDot = dot
    }
  }

  return {
    value: topValue,
    alignment: highestDot,
    separation: highestDot - secondHighestDot,
  }
}
