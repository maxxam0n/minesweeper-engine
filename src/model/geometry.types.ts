import type { FieldGrid } from './cell.types'
import type { FieldType, GameParams, Position } from './primitives.types'

/**
 * Geometry interface defining field boundary checks and cell adjacency calculations.
 * Provides methods to validate positions and retrieve neighboring cells based on the field's grid type.
 */
export interface FieldGeometry {
	/** Check if a position is within the field boundaries */
	isInBoundary({ row, col }: Position): boolean

	/** Get the siblings of a cell */
	getSiblings(pos: Position): Position[]

	/** Optional optimized list of all valid positions */
	getAllPositions?(): Position[]
}

/**
 * Properties for constructing a field instance.
 */
export interface ConstructorFieldProps {
	/** Game parameters (dimensions and mine count) */
	params: GameParams

	/** Field geometry */
	geometry: FieldGeometry

	/** Optional random number generator function (0-1 range). If not provided, uses Math.random */
	rng?: () => number

	/** Optional pre-existing cell data to initialize the field with */
	data?: FieldGrid

	/**
	 * Позиции, исключаемые из RNG-расстановки мин (start / safe opening).
	 * Игнорируется, если передан `data`.
	 */
	excludeFromMines?: Position[]
}

/**
 * Configuration for creating a field instance.
 */
export interface GeometryFactoryConfig {
	/** Type of field grid to create */
	type: FieldType

	/** Game configuration parameters defining the field dimensions and mine count. */
	params: GameParams
}
