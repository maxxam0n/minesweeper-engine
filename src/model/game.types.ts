import type { CreateFieldAnalyzer } from './analyzer.types'
import type { CellData, FieldGrid } from './cell.types'
import type { FieldState } from './field-state.types'
import type {
	ConstructorFieldProps,
	FieldGeometry,
} from './geometry.types'
import type {
	FieldType,
	GameMode,
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
 * Сериализуемое состояние партии (без RNG и custom geometry-инстанса).
 * Для custom geometry при restore нужно передать `geometry` в options.
 */
export type PersistedGameState = {
	version: typeof PERSISTED_GAME_VERSION
	params: GameParams
	mode: GameMode
	status: GameStatus
	/** Встроенный тип поля; отсутствует, если использовалась custom geometry */
	type?: FieldType
	field: FieldGrid
}

type BaseMinesweeperConfig = Omit<ConstructorFieldProps, 'geometry'> & {
	/** Game mode determining whether guessing is allowed */
	mode?: GameMode

	/**
	 * Фабрика анализатора для режима `no-guessing`.
	 * По умолчанию используется встроенный Solver.
	 */
	createAnalyzer?: CreateFieldAnalyzer

	/** Максимум записей undo-истории (по умолчанию 100) */
	maxHistory?: number
}

/**
 * Complete configuration for creating a minesweeper game engine instance.
 */
export type MineSweeperConfig = BaseMinesweeperConfig &
	(
		| { geometry?: never; type: FieldType }
		| { type?: never; geometry: FieldGeometry }
	)
