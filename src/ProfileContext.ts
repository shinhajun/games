import { createContext } from 'react'
import type { PlayerProfile } from './types'

export interface ProfileContextValue {
  profile: PlayerProfile | null
  setName: (name: string) => void
}

export const ProfileContext = createContext<ProfileContextValue | null>(null)
