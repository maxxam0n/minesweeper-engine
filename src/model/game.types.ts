import type { CellData, FieldGrid } from './cell.types'
import type { FieldState } from './field-state.types'
import type {
	ConstructorFieldProps,
	FieldGeometry,
} from './geometry.types'
import type {
	FieldType,
	GameParams,
	GameStatus,
} from './primitives.types'

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

export const PERSISTED_GAME_VERSION = 1 as const

/**
 * Сериализуемое состояние партии (без RNG и geometry-инстанса).
 * При restore всегда передайте `geometry` в options
 * (legacy-снимки с `type` могут восстановить geometry через GeometryFactory).
 */
export type PersistedGameState = {
	version: typeof PERSISTED_GAME_VERSION
	params: GameParams
	status: GameStatus
	/** @deprecated legacy; новые снимки не пишут type */
	type?: FieldType
	/** @deprecated legacy; mode удалён из движка */
	mode?: string
	field: FieldGrid
}

/**
 * Конфиг движка: geometry обязательна (встроенная через GeometryFactory или своя).
 */
export type MineSweeperConfig = Omit<
	ConstructorFieldProps,
	'excludeFromMines'
> & {
	geometry: FieldGeometry

	/** Максимум записей undo-истории (по умолчанию 100) */
	maxHistory?: number
}
