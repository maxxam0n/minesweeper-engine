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
