import { useMemo, useState, type ReactNode } from 'react'
import { ProfileContext } from './ProfileContext'
import { readProfile, saveProfile } from './lib/profile'
import type { PlayerProfile } from './types'

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<PlayerProfile | null>(() => readProfile())
  const value = useMemo(() => ({
    profile,
    setName: (name: string) => setProfile(saveProfile(name, profile)),
  }), [profile])

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}
