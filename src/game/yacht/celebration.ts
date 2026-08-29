import { scoreYachtCategory } from './scoring'

export type YachtCelebrationTier = 'rare' | 'epic' | 'legendary'

export interface YachtCelebration {
  kind: 'smallStraight' | 'largeStraight' | 'fullHouse' | 'fourKind' | 'yacht'
  label: string
  detail: string
  tier: YachtCelebrationTier
}

export interface YachtCelebrationEvent extends YachtCelebration {
  id: number
}

const celebrations: YachtCelebration[] = [
  { kind: 'yacht', label: 'YACHT!', detail: '다섯 주사위가 완벽하게 맞았습니다', tier: 'legendary' },
  { kind: 'largeStraight', label: 'LARGE STRAIGHT!', detail: '2부터 6까지 스트레이트 완성', tier: 'epic' },
  { kind: 'fourKind', label: 'FOUR OF A KIND!', detail: '같은 눈 네 개를 완성했습니다', tier: 'epic' },
  { kind: 'fullHouse', label: 'FULL HOUSE!', detail: '트리플과 페어를 동시에 완성', tier: 'rare' },
  { kind: 'smallStraight', label: 'SMALL STRAIGHT!', detail: '1부터 5까지 스트레이트 완성', tier: 'rare' },
]

export function getYachtCelebration(dice: number[]): YachtCelebration | null {
  return celebrations.find((celebration) => scoreYachtCategory(celebration.kind, dice) > 0) ?? null
}
