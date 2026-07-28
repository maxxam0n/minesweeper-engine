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
	readonly status: GameStatus
}

/**
 * Changes resulting from a game action (reveal, flag, etc.).
 */
export interface ActionChanges {
	/** The target cell that was acted upon */
	readonly target: CellData

	/** All cells that were affected by this action */
	readonly handledCells: readonly CellData[]

	/** Cells that were flagged in this action */
	readonly flaggedCells: readonly CellData[]

	/** Cells that had flags removed in this action */
	readonly unflaggedCells: readonly CellData[]

	/** Cells that were revealed in this action */
	readonly revealedCells: readonly CellData[]

	/** Cells that exploded (mines that were revealed) in this action */
	readonly explodedCells: readonly CellData[]
}

/**
 * Result of a game action with the ability to apply changes to the game state.
 */
export interface ActionResult {
	/** Function to apply the action changes to the game engine state */
	readonly apply: () => void

	/** Action result data */
	readonly data: {
		/** Snapshot of the game state after this action */
		readonly actionSnapshot: GameSnapshot

		/** Detailed changes made by this action */
		readonly actionChanges: ActionChanges
	}
}

export const PERSISTED_GAME_VERSION = 1 as const

/**
 * Сериализуемое состояние партии (без RNG и geometry-инстанса).
 * При restore всегда передайте `geometry` в options
 * (legacy-снимки с `type` могут восстановить geometry через GeometryFactory).
 */
export type PersistedGameState = {
	readonly version: typeof PERSISTED_GAME_VERSION
	readonly params: GameParams
	readonly status: GameStatus
	/** @deprecated legacy; новые снимки не пишут type */
	readonly type?: FieldType
	/** @deprecated legacy; mode удалён из движка */
	readonly mode?: string
	readonly field: FieldGrid
}

/**
 * Конфиг движка: geometry обязательна (встроенная через GeometryFactory или своя).
 */
export type MineSweeperConfig = Omit<
	ConstructorFieldProps,
	'excludeFromMines'
> & {
	readonly geometry: FieldGeometry

	/** Максимум записей undo-истории (по умолчанию 100) */
	readonly maxHistory?: number
}
