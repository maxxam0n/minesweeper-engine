import type { CellData, FieldGrid } from './cell.types'

/**
 * Complete state of the field including all cells and categorized cell lists.
 */
export interface FieldState {
	/** Two-dimensional array of all cells organized by rows */
	field: FieldGrid

	/** All cells that contain mines */
	minedCells: CellData[]

	/** All cells that exploded (mines that were revealed) */
	explodedCells: CellData[]

	/** All cells that are currently flagged */
	flaggedCells: CellData[]

	/** All mines that were not flagged (used for end-game analysis) */
	notFoundMines: CellData[]

	/** All cells that were incorrectly flagged (flags on non-mine cells) */
	errorFlags: CellData[]

	/** All cells that have been revealed */
	revealedCells: CellData[]
}
