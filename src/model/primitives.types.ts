/**
 * Game configuration parameters defining the field dimensions and mine count.
 */
export type GameParams = {
	/** Number of columns in the field */
	readonly cols: number

	/** Number of rows in the field */
	readonly rows: number

	/** Total number of mines to place on the field */
	readonly mines: number
}

/**
 * Cell position coordinates on the field.
 */
export type Position = {
	/** Column index (0-based) */
	readonly col: number

	/** Row index (0-based) */
	readonly row: number
}

/**
 * Supported field grid types.
 */
export type FieldType = 'square' | 'hexagonal' | 'triangle'

/**
 * Current state of the game.
 */
export type GameStatus = 'idle' | 'playing' | 'won' | 'lost'
