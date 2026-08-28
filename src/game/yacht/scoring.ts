export type YachtCategory =
  | 'ones'
  | 'twos'
  | 'threes'
  | 'fours'
  | 'fives'
  | 'sixes'
  | 'choice'
  | 'fourKind'
  | 'fullHouse'
  | 'littleStraight'
  | 'bigStraight'
  | 'yacht'

export const YACHT_CATEGORIES: { id: YachtCategory; label: string; hint: string; max: number }[] = [
  { id: 'ones', label: 'Aces', hint: '1의 합', max: 5 },
  { id: 'twos', label: 'Deuces', hint: '2의 합', max: 10 },
  { id: 'threes', label: 'Threes', hint: '3의 합', max: 15 },
  { id: 'fours', label: 'Fours', hint: '4의 합', max: 20 },
  { id: 'fives', label: 'Fives', hint: '5의 합', max: 25 },
  { id: 'sixes', label: 'Sixes', hint: '6의 합', max: 30 },
  { id: 'choice', label: 'Choice', hint: '모든 주사위 합', max: 30 },
  { id: 'fourKind', label: 'Four of a Kind', hint: '같은 눈 4개의 합', max: 24 },
  { id: 'fullHouse', label: 'Full House', hint: '3개 + 2개, 전체 합', max: 28 },
  { id: 'littleStraight', label: 'Little Straight', hint: '1·2·3·4·5', max: 30 },
  { id: 'bigStraight', label: 'Big Straight', hint: '2·3·4·5·6', max: 30 },
  { id: 'yacht', label: 'Yacht', hint: '같은 눈 5개', max: 50 },
]

const upperFaces: Partial<Record<YachtCategory, number>> = {
  ones: 1,
  twos: 2,
  threes: 3,
  fours: 4,
  fives: 5,
  sixes: 6,
}

export function scoreYachtCategory(category: YachtCategory, dice: number[]): number {
  if (dice.length !== 5 || dice.some((die) => !Number.isInteger(die) || die < 1 || die > 6)) return 0

  const face = upperFaces[category]
  if (face) return dice.filter((die) => die === face).reduce((sum) => sum + face, 0)

  const counts = new Map<number, number>()
  dice.forEach((die) => counts.set(die, (counts.get(die) ?? 0) + 1))
  const values = [...counts.values()].sort((a, b) => b - a)
  const total = dice.reduce((sum, die) => sum + die, 0)
  const sorted = [...dice].sort((a, b) => a - b).join('')

  switch (category) {
    case 'choice':
      return total
    case 'fourKind': {
      const match = [...counts.entries()].find(([, count]) => count >= 4)
      return match ? match[0] * 4 : 0
    }
    case 'fullHouse':
      return values.length === 2 && values[0] === 3 && values[1] === 2 ? total : 0
    case 'littleStraight':
      return sorted === '12345' ? 30 : 0
    case 'bigStraight':
      return sorted === '23456' ? 30 : 0
    case 'yacht':
      return values[0] === 5 ? 50 : 0
    default:
      return 0
  }
}

export function totalYachtScore(scores: Partial<Record<YachtCategory, number>>) {
  return Object.values(scores).reduce<number>((sum, score) => sum + (score ?? 0), 0)
}
