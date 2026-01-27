/**
 * Game configuration parameters defining the field dimensions and mine count.
 */
export type GameParams = {
	/** Number of columns in the field */
	cols: number
	/** Number of rows in the field */
	rows: number
	/** Total number of mines to place on the field */
	mines: number
}

/**
 * Cell position coordinates on the field.
 */
export type Position = {
	/** Column index (0-based) */
	col: number
	/** Row index (0-based) */
	row: number
}

/**
 * Supported field grid types.
 */
export type FieldType = 'square' | 'hexagonal' | 'triangle'

/**
 * Current state of the game.
 */
export type GameStatus = 'idle' | 'playing' | 'won' | 'lost'

/**
 * Game mode determining whether guessing is allowed.
 * - `'no-guessing'`: Prevents moves that require guessing when solver detects uncertain states
 * - `'guessing'`: Allows any move, including those that require guessing
 */
export type GameMode = 'no-guessing' | 'guessing'

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
 * Complete state of the field including all cells and categorized cell lists.
 */
export interface FieldState {
	/** Two-dimensional array of all cells organized by rows */
	field: CellData[][]
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

/**
 * Properties for constructing a cell, with position being required.
 */
export interface ConstructorCellProps extends Partial<CellData> {
	/** Required cell position */
	position: Position
}

/**
 * Properties for constructing a field instance.
 */
export interface ConstrutorFieldProps {
	/** Game parameters (dimensions and mine count) */
	params: GameParams
	/** Optional random number generator function (0-1 range). If not provided, uses Math.random */
	rng?: () => number
	/** Optional pre-existing cell data to initialize the field with */
	data?: CellData[][]
}

/**
 * Complete game state snapshot including field state and game status.
 */
export interface GameSnapshot extends FieldState {
	/** Current game status */
	status: GameStatus
}

/**
 * Changes resulting from a game action (reveal, flag, etc.).
 */
export interface ActionChanges {
	/** The target cell that was acted upon */
	target: CellData
	/** All cells that were affected by this action */
	handledCells: CellData[]
	/** Cells that were flagged in this action */
	flaggedCells: CellData[]
	/** Cells that had flags removed in this action */
	unflaggedCells: CellData[]
	/** Cells that were revealed in this action */
	revealedCells: CellData[]
	/** Cells that exploded (mines that were revealed) in this action */
	explodedCells: CellData[]
}

/**
 * Result of a game action with the ability to apply changes to the game state.
 */
export interface ActionResult {
	/** Function to apply the action changes to the game engine state */
	apply: () => void
	/** Action result data */
	data: {
		/** Snapshot of the game state after this action */
		actionSnapshot: GameSnapshot
		/** Detailed changes made by this action */
		actionChanges: ActionChanges
	}
}

/**
 * Configuration for creating a field instance.
 */
export interface FactoryConfig {
	/** Game parameters (dimensions and mine count) */
	params: GameParams
	/** Type of field grid to create */
	type: FieldType
	/** Optional random number generator function (0-1 range). If not provided, uses Math.random */
	rng?: () => number
	/** Optional pre-existing cell data to initialize the field with */
	data?: CellData[][]
}

/**
 * Complete configuration for creating a minesweeper game engine instance.
 */
export interface MineSweeperConfig extends FactoryConfig {
	/** Game mode determining whether guessing is allowed */
	mode?: GameMode
}
