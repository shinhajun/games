import type { PlayerProfile } from '../types'

const PROFILE_KEY = 'hajun-arcade:profile:v1'

export function readProfile(): PlayerProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PlayerProfile>
    if (!parsed.id || !parsed.name) return null
    return { id: parsed.id, name: parsed.name }
  } catch {
    return null
  }
}

export function saveProfile(name: string, previous?: PlayerProfile | null): PlayerProfile {
  const profile = {
    id: previous?.id ?? crypto.randomUUID(),
    name: name.trim().replace(/\s+/g, ' ').slice(0, 16),
  }
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
  return profile
}

export function clearProfile() {
  localStorage.removeItem(PROFILE_KEY)
}
