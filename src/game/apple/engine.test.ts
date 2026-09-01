import { describe, expect, it } from 'vitest'
import {
  APPLE_COLUMNS,
  APPLE_COUNT,
  APPLE_PORTRAIT_COLUMNS,
  APPLE_PORTRAIT_ROWS,
  APPLE_ROWS,
  appleCellFromPoint,
  appleSelectionTotal,
  clearAppleSelection,
  createAppleBoard,
  type AppleBoard,
} from './engine'

describe('apple game board and rules', () => {
  it('creates the original 17 by 10 board with values from 1 to 9', () => {
    let sample = 0
    const board = createAppleBoard(() => (sample++ % 9) / 9)

    expect(board).toHaveLength(APPLE_COUNT)
    expect(APPLE_COLUMNS).toBe(17)
    expect(APPLE_ROWS).toBe(10)
    expect(Math.min(...board as number[])).toBe(1)
    expect(Math.max(...board as number[])).toBe(9)
  })

  it('clears every remaining apple in a rectangle only when the sum is exactly ten', () => {
    const board: AppleBoard = Array(APPLE_COUNT).fill(null)
    board[0] = 2
    board[1] = 3
    board[APPLE_COLUMNS] = 1
    board[APPLE_COLUMNS + 1] = 4
    const selection = { start: { row: 0, column: 0 }, end: { row: 1, column: 1 } }

    const result = clearAppleSelection(board, selection)

    expect(result).toMatchObject({ valid: true, total: 10, score: 4 })
    expect(result.clearedIndices).toEqual([0, 1, APPLE_COLUMNS, APPLE_COLUMNS + 1])
    expect(result.clearedIndices.every((index) => result.board[index] === null)).toBe(true)
  })

  it('treats cleared gaps as zero so separated apples can still make ten', () => {
    const board: AppleBoard = Array(APPLE_COUNT).fill(null)
    board[0] = 4
    board[3] = 6
    const selection = { start: { row: 0, column: 0 }, end: { row: 0, column: 3 } }

    expect(appleSelectionTotal(board, selection)).toBe(10)
    expect(clearAppleSelection(board, selection)).toMatchObject({ valid: true, score: 2 })
  })

  it('leaves the board untouched after an invalid drag', () => {
    const board: AppleBoard = Array(APPLE_COUNT).fill(1)
    const selection = { start: { row: 0, column: 0 }, end: { row: 0, column: 2 } }

    const result = clearAppleSelection(board, selection)

    expect(result).toMatchObject({ valid: false, total: 3, score: 0 })
    expect(result.board).toBe(board)
  })

  it('maps pointer positions to bounded board cells', () => {
    expect(appleCellFromPoint(0, 0, 1700, 1000)).toEqual({ row: 0, column: 0 })
    expect(appleCellFromPoint(1699, 999, 1700, 1000)).toEqual({ row: 9, column: 16 })
    expect(appleCellFromPoint(-30, 1200, 1700, 1000)).toEqual({ row: 9, column: 0 })
  })

  it('supports the same 170 apples in a taller 10 by 17 mobile grid', () => {
    const board: AppleBoard = Array(APPLE_COUNT).fill(null)
    board[0] = 2
    board[1] = 3
    board[10] = 1
    board[11] = 4
    const selection = { start: { row: 0, column: 0 }, end: { row: 1, column: 1 } }

    expect(appleCellFromPoint(999, 1699, 1000, 1700, APPLE_PORTRAIT_COLUMNS, APPLE_PORTRAIT_ROWS)).toEqual({ row: 16, column: 9 })
    expect(clearAppleSelection(board, selection, APPLE_PORTRAIT_COLUMNS)).toMatchObject({ valid: true, total: 10, score: 4 })
  })
})
