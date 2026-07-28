import type { CellData, FieldGrid } from './cell.types'

/**
 * Complete state of the field including all cells and categorized cell lists.
 */
export interface FieldState {
	/** Two-dimensional array of all cells organized by rows */
	readonly field: FieldGrid

	/** All cells that contain mines */
	readonly minedCells: readonly CellData[]

	/** All cells that exploded (mines that were revealed) */
	readonly explodedCells: readonly CellData[]

	/** All cells that are currently flagged */
	readonly flaggedCells: readonly CellData[]

	/** All mines that were not flagged (used for end-game analysis) */
	readonly notFoundMines: readonly CellData[]

	/** All cells that were incorrectly flagged (flags on non-mine cells) */
	readonly errorFlags: readonly CellData[]

	/** All cells that have been revealed */
	readonly revealedCells: readonly CellData[]
}
