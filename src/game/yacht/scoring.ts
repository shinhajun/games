export type YachtCategory =
  | 'ones'
  | 'twos'
  | 'threes'
  | 'fours'
  | 'fives'
  | 'sixes'
  | 'choice'
  | 'onePair'
  | 'twoPairs'
  | 'threeKind'
  | 'fourKind'
  | 'smallStraight'
  | 'largeStraight'
  | 'fullHouse'
  | 'yacht'

export const YACHT_CATEGORIES: { id: YachtCategory; label: string; hint: string; max: number }[] = [
  { id: 'ones', label: '1', hint: '1의 합', max: 5 },
  { id: 'twos', label: '2', hint: '2의 합', max: 10 },
  { id: 'threes', label: '3', hint: '3의 합', max: 15 },
  { id: 'fours', label: '4', hint: '4의 합', max: 20 },
  { id: 'fives', label: '5', hint: '5의 합', max: 25 },
  { id: 'sixes', label: '6', hint: '6의 합', max: 30 },
  { id: 'choice', label: '초이스', hint: '모든 주사위 합', max: 30 },
  { id: 'onePair', label: '원페어', hint: '가장 높은 같은 눈 2개', max: 12 },
  { id: 'twoPairs', label: '투페어', hint: '서로 다른 페어 2개', max: 22 },
  { id: 'threeKind', label: '트리플', hint: '같은 눈 3개의 합', max: 18 },
  { id: 'fourKind', label: '포카드', hint: '같은 눈 4개의 합', max: 24 },
  { id: 'smallStraight', label: '스몰 스트레이트', hint: '1·2·3·4·5', max: 15 },
  { id: 'largeStraight', label: '라지 스트레이트', hint: '2·3·4·5·6', max: 20 },
  { id: 'fullHouse', label: '풀하우스', hint: '3개 + 2개, 전체 합', max: 28 },
  { id: 'yacht', label: '야추', hint: '같은 눈 5개', max: 50 },
]

export const YACHT_UPPER_BONUS_THRESHOLD = 63
export const YACHT_UPPER_BONUS = 35
export const YACHT_MAX_SCORE = YACHT_CATEGORIES.reduce((sum, category) => sum + category.max, YACHT_UPPER_BONUS)

const upperCategories: YachtCategory[] = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes']

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
    case 'onePair': {
      const match = [...counts.entries()]
        .filter(([, count]) => count >= 2)
        .sort(([first], [second]) => second - first)[0]
      return match ? match[0] * 2 : 0
    }
    case 'twoPairs': {
      const matches = [...counts.entries()]
        .filter(([, count]) => count >= 2)
        .sort(([first], [second]) => second - first)
      return matches.length >= 2 ? (matches[0][0] + matches[1][0]) * 2 : 0
    }
    case 'threeKind': {
      const match = [...counts.entries()].find(([, count]) => count >= 3)
      return match ? match[0] * 3 : 0
    }
    case 'fourKind': {
      const match = [...counts.entries()].find(([, count]) => count >= 4)
      return match ? match[0] * 4 : 0
    }
    case 'smallStraight':
      return sorted === '12345' ? 15 : 0
    case 'largeStraight':
      return sorted === '23456' ? 20 : 0
    case 'fullHouse':
      return values.length === 2 && values[0] === 3 && values[1] === 2 ? total : 0
    case 'yacht':
      return values[0] === 5 ? 50 : 0
    default:
      return 0
  }
}

export function upperYachtSubtotal(scores: Partial<Record<YachtCategory, number>>) {
  return upperCategories.reduce((sum, category) => sum + (scores[category] ?? 0), 0)
}

export function upperYachtBonus(scores: Partial<Record<YachtCategory, number>>) {
  return upperYachtSubtotal(scores) >= YACHT_UPPER_BONUS_THRESHOLD ? YACHT_UPPER_BONUS : 0
}

export function totalYachtScore(scores: Partial<Record<YachtCategory, number>>) {
  return Object.values(scores).reduce<number>((sum, score) => sum + (score ?? 0), 0) + upperYachtBonus(scores)
}
