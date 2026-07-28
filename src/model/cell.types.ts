import type { Cell } from './Cell'
import type { Position } from './primitives.types'

/**
 * Complete cell data representing a single cell on the field.
 */
export interface CellData {
	/** Unique identifier for the cell */
	readonly key: string

	/** Cell position coordinates */
	readonly position: Position

	/** Whether this cell contains a mine */
	readonly isMine: boolean

	/** Number of adjacent cells containing mines */
	readonly adjacentMines: number

	/** Whether this cell is a mine that was not flagged (used for end-game analysis) */
	readonly notFoundMine: boolean

	/** Whether this cell has been revealed */
	readonly isRevealed: boolean

	/** Whether this cell has been flagged as a potential mine */
	readonly isFlagged: boolean

	/** Whether this cell is empty (no adjacent mines) */
	readonly isEmpty: boolean

	/** Whether this cell exploded (mine was revealed) */
	readonly isExploded: boolean

	/** Whether this cell was a mine that was missed (flagged incorrectly) */
	readonly isMissed: boolean

	/** Whether this cell is untouched (not revealed and not flagged) */
	readonly isUntouched: boolean
}

export type FieldCellGrid = Array<Array<Cell | null>>

/** Readonly DTO поля для снимков, persistence и входных данных. */
export type FieldGrid = ReadonlyArray<ReadonlyArray<CellData | null>>

/**
 * Mine probability calculation result for a specific cell position.
 */
export interface MineProbability {
	/** Probability value between 0 and 1 (0 = safe, 1 = definitely a mine) */
	readonly value: number

	/** Position of the cell this probability applies to */
	readonly position: Position
}

/**
 * Properties for constructing a cell, with position being required.
 */
export interface ConstructorCellProps {
	/** Cell position coordinates */
	readonly position: Position

	/** Number of adjacent cells containing mines */
	readonly adjacentMines?: number

	/** Whether this cell has been flagged as a potential mine */
	readonly isFlagged?: boolean

	/** Whether this cell contains a mine */
	readonly isMine?: boolean

	/** Whether this cell has been revealed */
	readonly isRevealed?: boolean
}
