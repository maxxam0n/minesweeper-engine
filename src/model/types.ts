export type GameParams = {
	cols: number
	rows: number
	mines: number
}

export type Position = {
	col: number
	row: number
}

export type FieldType = 'square' | 'hexagonal' | 'triangle'

export type GameStatus = 'idle' | 'playing' | 'won' | 'lost'

export type GameMode = 'no-guessing' | 'guessing'

export interface CellData {
	key: string
	position: Position
	isMine: boolean
	adjacentMines: number
	notFoundMine: boolean
	isRevealed: boolean
	isFlagged: boolean
	isEmpty: boolean
	isExploded: boolean
	isMissed: boolean
	isUntouched: boolean
}

export interface MineProbability {
	value: number
	position: Position
}

export interface FieldState {
	field: CellData[][]
	minedCells: CellData[]
	explodedCells: CellData[]
	flaggedCells: CellData[]
	notFoundMines: CellData[]
	errorFlags: CellData[]
	revealedCells: CellData[]
}

export interface ConstructorCellProps extends Partial<CellData> {
	position: Position
}

export interface ConstrutorFieldProps {
	params: GameParams
	rng?: () => number
	data?: CellData[][]
}

export interface GameSnapshot extends FieldState {
	status: GameStatus
}

export interface ActionChanges {
	target: CellData
	handledCells: CellData[]
	flaggedCells: CellData[]
	unflaggedCells: CellData[]
	revealedCells: CellData[]
	explodedCells: CellData[]
}

export interface ActionResult {
	apply: () => void
	data: {
		actionSnapshot: GameSnapshot
		actionChanges: ActionChanges
	}
}

export interface FactoryConfig {
	params: GameParams
	type: FieldType
	rng?: () => number
	data?: CellData[][]
}

export interface MineSweeperConfig extends FactoryConfig {
	mode?: GameMode
}
