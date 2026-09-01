export const APPLE_COLUMNS = 17
export const APPLE_ROWS = 10
export const APPLE_COUNT = APPLE_COLUMNS * APPLE_ROWS
export const APPLE_TARGET = 10
export const APPLE_ROUND_MS = 120_000

export type AppleBoard = Array<number | null>

export interface AppleCellPosition {
  row: number
  column: number
}

export interface AppleSelection {
  start: AppleCellPosition
  end: AppleCellPosition
}

export interface NormalizedAppleSelection {
  top: number
  right: number
  bottom: number
  left: number
}

export interface AppleClearResult {
  board: AppleBoard
  clearedIndices: number[]
  score: number
  total: number
  valid: boolean
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value))
}

export function createAppleBoard(random: () => number = Math.random): AppleBoard {
  return Array.from({ length: APPLE_COUNT }, () => Math.floor(clamp(random(), 0, 0.999999999) * 9) + 1)
}

export function normalizeAppleSelection(selection: AppleSelection): NormalizedAppleSelection {
  return {
    top: Math.min(selection.start.row, selection.end.row),
    right: Math.max(selection.start.column, selection.end.column),
    bottom: Math.max(selection.start.row, selection.end.row),
    left: Math.min(selection.start.column, selection.end.column),
  }
}

export function appleIndicesInSelection(selection: AppleSelection) {
  const bounds = normalizeAppleSelection(selection)
  const indices: number[] = []
  for (let row = bounds.top; row <= bounds.bottom; row += 1) {
    for (let column = bounds.left; column <= bounds.right; column += 1) {
      indices.push(row * APPLE_COLUMNS + column)
    }
  }
  return indices
}

export function appleSelectionTotal(board: AppleBoard, selection: AppleSelection) {
  return appleIndicesInSelection(selection).reduce((total, index) => total + (board[index] ?? 0), 0)
}

export function clearAppleSelection(board: AppleBoard, selection: AppleSelection): AppleClearResult {
  const indices = appleIndicesInSelection(selection)
  const total = indices.reduce((sum, index) => sum + (board[index] ?? 0), 0)
  const clearedIndices = total === APPLE_TARGET ? indices.filter((index) => board[index] !== null) : []
  if (clearedIndices.length === 0) {
    return { board, clearedIndices, score: 0, total, valid: false }
  }

  const nextBoard = [...board]
  clearedIndices.forEach((index) => { nextBoard[index] = null })
  return {
    board: nextBoard,
    clearedIndices,
    score: clearedIndices.length,
    total,
    valid: true,
  }
}

export function appleCellFromPoint(x: number, y: number, width: number, height: number): AppleCellPosition {
  const safeWidth = Math.max(width, 1)
  const safeHeight = Math.max(height, 1)
  return {
    row: clamp(Math.floor(y / safeHeight * APPLE_ROWS), 0, APPLE_ROWS - 1),
    column: clamp(Math.floor(x / safeWidth * APPLE_COLUMNS), 0, APPLE_COLUMNS - 1),
  }
}
