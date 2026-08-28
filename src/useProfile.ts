import { useContext } from 'react'
import { ProfileContext } from './ProfileContext'

export function useProfile() {
  const value = useContext(ProfileContext)
  if (!value) throw new Error('useProfile must be used inside ProfileProvider')
  return value
}
