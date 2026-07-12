import type { Cell } from './Cell'
import type { Position } from './primitives.types'

/**
 * Complete cell data representing a single cell on the field.
 */
export interface CellData {
	/** Unique identifier for the cell */
	key: string

	/** Cell position coordinates */
	position: Position

	/** Whether this cell contains a mine */
	isMine: boolean

	/** Number of adjacent cells containing mines */
	adjacentMines: number

	/** Whether this cell is a mine that was not flagged (used for end-game analysis) */
	notFoundMine: boolean

	/** Whether this cell has been revealed */
	isRevealed: boolean

	/** Whether this cell has been flagged as a potential mine */
	isFlagged: boolean

	/** Whether this cell is empty (no adjacent mines) */
	isEmpty: boolean

	/** Whether this cell exploded (mine was revealed) */
	isExploded: boolean

	/** Whether this cell was a mine that was missed (flagged incorrectly) */
	isMissed: boolean

	/** Whether this cell is untouched (not revealed and not flagged) */
	isUntouched: boolean
}

export type FieldCellGrid = Array<Array<Cell | null>>

export type FieldGrid = Array<Array<CellData | null>>

/**
 * Mine probability calculation result for a specific cell position.
 */
export interface MineProbability {
	/** Probability value between 0 and 1 (0 = safe, 1 = definitely a mine) */
	value: number

	/** Position of the cell this probability applies to */
	position: Position
}

/**
 * Properties for constructing a cell, with position being required.
 */
export interface ConstructorCellProps {
	/** Cell position coordinates */
	position: Position

	/** Number of adjacent cells containing mines */
	adjacentMines?: number

	/** Whether this cell has been flagged as a potential mine */
	isFlagged?: boolean

	/** Whether this cell contains a mine */
	isMine?: boolean

	/** Whether this cell has been revealed */
	isRevealed?: boolean
}
