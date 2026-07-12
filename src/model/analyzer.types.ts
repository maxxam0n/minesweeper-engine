import type { CellData, MineProbability } from './cell.types'
import type { FieldState } from './field-state.types'
import type { Position } from './primitives.types'

/**
 * Анализатор поля для проверки решаемости (генератор no-guessing)
 * и подсказок во время игры.
 * По умолчанию — MinesweeperSolver; можно подменить через createAnalyzer.
 */
export interface FieldAnalyzer {
	solve(): MineProbability[]
	isGuessingState(probabilities: MineProbability[]): boolean
}

/**
 * Фабрика анализатора. Принимает минимальный view поля (Field удовлетворяет контракту).
 */
export type CreateFieldAnalyzer = (field: {
	getFieldSnapshot(): FieldState
	getSiblings(pos: Position): CellData[]
}) => FieldAnalyzer
