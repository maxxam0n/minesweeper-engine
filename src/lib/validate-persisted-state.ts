import { createKey } from './utils'
import {
	assertValidGameParams,
	InvalidGameParamsError,
} from './validate-params'
import { GeometryFactory } from '../model/geometry/Factory'
import type {
	CellData,
	FieldGeometry,
	FieldGrid,
	FieldType,
	GameParams,
	GameStatus,
	PersistedGameState,
	Position,
} from '../model/types'
import { PERSISTED_GAME_VERSION } from '../model/types'

type UnknownRecord = Record<string, unknown>

type ParsedPersistedMetadata = {
	readonly record: UnknownRecord
	readonly params: GameParams
	readonly status: GameStatus
	readonly type?: FieldType
	readonly mode?: string
}

export type ValidatedPersistedGame = {
	readonly geometry: FieldGeometry
	readonly state: PersistedGameState
}

export class InvalidPersistedGameStateError extends Error {
	public constructor(reason: string) {
		super(`Invalid persisted game state: ${reason}`)
		this.name = 'InvalidPersistedGameStateError'
	}
}

const fail = (reason: string): never => {
	throw new InvalidPersistedGameStateError(reason)
}

const isRecord = (value: unknown): value is UnknownRecord =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

const isUnknownArray = (value: unknown): value is unknown[] =>
	Array.isArray(value)

const assertDenseArray = (
	value: readonly unknown[],
	expectedLength: number,
	path: string,
): void => {
	if (value.length !== expectedLength) {
		fail(`${path} must contain exactly ${String(expectedLength)} items.`)
	}
	for (let index = 0; index < expectedLength; index++) {
		if (!Object.prototype.hasOwnProperty.call(value, index)) {
			fail(`${path}[${String(index)}] must be present.`)
		}
	}
}

const parseParams = (value: unknown): GameParams => {
	if (!isRecord(value)) return fail('"params" must be an object.')

	const { cols, mines, rows } = value
	if (
		typeof cols !== 'number' ||
		typeof mines !== 'number' ||
		typeof rows !== 'number'
	) {
		return fail('"params" must contain numeric rows, cols and mines.')
	}

	const params = { cols, mines, rows }
	try {
		assertValidGameParams(params)
	} catch (error: unknown) {
		if (error instanceof InvalidGameParamsError) {
			return fail(error.message)
		}
		throw error
	}
	return params
}

const gameStatuses = new Set<GameStatus>([
	'idle',
	'playing',
	'won',
	'lost',
])

const isGameStatus = (value: unknown): value is GameStatus =>
	typeof value === 'string' && gameStatuses.has(value as GameStatus)

const fieldTypes = new Set<FieldType>([
	'square',
	'hexagonal',
	'triangle',
])

const isFieldType = (value: unknown): value is FieldType =>
	typeof value === 'string' && fieldTypes.has(value as FieldType)

const parseMetadata = (value: unknown): ParsedPersistedMetadata => {
	if (!isRecord(value)) return fail('state must be an object.')
	if (value.version !== PERSISTED_GAME_VERSION) {
		return fail(
			`unsupported version ${String(value.version)}; expected ${String(PERSISTED_GAME_VERSION)}.`,
		)
	}
	if (!isGameStatus(value.status)) {
		return fail(`unsupported status ${String(value.status)}.`)
	}
	if (value.type !== undefined && !isFieldType(value.type)) {
		return fail(`unsupported geometry type ${String(value.type)}.`)
	}
	if (value.mode !== undefined && typeof value.mode !== 'string') {
		return fail('"mode" must be a string when present.')
	}

	return {
		record: value,
		params: parseParams(value.params),
		status: value.status,
		...(value.type === undefined ? {} : { type: value.type }),
		...(value.mode === undefined ? {} : { mode: value.mode }),
	}
}

const requireString = (
	record: UnknownRecord,
	property: string,
	path: string,
): string => {
	const value = record[property]
	if (typeof value !== 'string') {
		return fail(`${path}.${property} must be a string.`)
	}
	return value
}

const requireBoolean = (
	record: UnknownRecord,
	property: string,
	path: string,
): boolean => {
	const value = record[property]
	if (typeof value !== 'boolean') {
		return fail(`${path}.${property} must be a boolean.`)
	}
	return value
}

const requireFiniteInteger = (
	record: UnknownRecord,
	property: string,
	path: string,
): number => {
	const value = record[property]
	if (
		typeof value !== 'number' ||
		!Number.isFinite(value) ||
		!Number.isInteger(value)
	) {
		return fail(`${path}.${property} must be a finite integer.`)
	}
	return value
}

const parsePosition = (
	value: unknown,
	expected: Position,
	path: string,
): Position => {
	if (!isRecord(value)) return fail(`${path}.position must be an object.`)

	const row = requireFiniteInteger(value, 'row', `${path}.position`)
	const col = requireFiniteInteger(value, 'col', `${path}.position`)
	if (row !== expected.row || col !== expected.col) {
		return fail(
			`${path}.position must match its grid index ` +
				`(${String(expected.row)}, ${String(expected.col)}).`,
		)
	}
	return { row, col }
}

const assertDerivedCellValues = (cell: CellData, path: string): void => {
	const expectedValues = {
		isEmpty: !cell.isMine && cell.adjacentMines === 0,
		isExploded: cell.isMine && cell.isRevealed,
		isMissed: cell.isFlagged && !cell.isMine,
		notFoundMine: cell.isMine && !cell.isFlagged,
		isUntouched: !cell.isRevealed && !cell.isFlagged,
	}

	for (const property of Object.keys(expectedValues) as Array<
		keyof typeof expectedValues
	>) {
		if (cell[property] !== expectedValues[property]) {
			fail(`${path}.${property} is inconsistent with the cell state.`)
		}
	}

	if (cell.isFlagged && cell.isRevealed) {
		fail(`${path} cannot be both flagged and revealed.`)
	}
}

const parseCell = (
	value: unknown,
	position: Position,
	path: string,
): CellData => {
	if (!isRecord(value)) return fail(`${path} must be a cell object or null.`)

	const cell: CellData = {
		key: requireString(value, 'key', path),
		position: parsePosition(value.position, position, path),
		isMine: requireBoolean(value, 'isMine', path),
		adjacentMines: requireFiniteInteger(value, 'adjacentMines', path),
		notFoundMine: requireBoolean(value, 'notFoundMine', path),
		isRevealed: requireBoolean(value, 'isRevealed', path),
		isFlagged: requireBoolean(value, 'isFlagged', path),
		isEmpty: requireBoolean(value, 'isEmpty', path),
		isExploded: requireBoolean(value, 'isExploded', path),
		isMissed: requireBoolean(value, 'isMissed', path),
		isUntouched: requireBoolean(value, 'isUntouched', path),
	}

	if (cell.key !== createKey(position)) {
		return fail(`${path}.key is inconsistent with its grid position.`)
	}
	if (cell.adjacentMines < 0) {
		return fail(`${path}.adjacentMines cannot be negative.`)
	}
	assertDerivedCellValues(cell, path)
	return cell
}

const parseGrid = (
	value: unknown,
	params: GameParams,
	geometry: FieldGeometry,
): FieldGrid => {
	if (!isUnknownArray(value)) return fail('"field" must be an array.')
	assertDenseArray(value, params.rows, '"field"')

	return Array.from({ length: params.rows }, (_, row) => {
		const unknownRow = value[row]
		if (!isUnknownArray(unknownRow)) {
			return fail(`field[${String(row)}] must be an array.`)
		}
		assertDenseArray(unknownRow, params.cols, `field[${String(row)}]`)

		return Array.from({ length: params.cols }, (_, col) => {
			const unknownCell = unknownRow[col]
			const position = { row, col }
			const isCellExpected = geometry.isInBoundary(position)
			const path = `field[${String(row)}][${String(col)}]`

			if (!isCellExpected) {
				if (unknownCell !== null) {
					return fail(`${path} must be null outside the geometry boundary.`)
				}
				return null
			}
			if (unknownCell === null) {
				return fail(`${path} must contain a cell inside the geometry boundary.`)
			}
			return parseCell(unknownCell, position, path)
		})
	})
}

const getCell = (field: FieldGrid, position: Position): CellData | null =>
	field[position.row]?.[position.col] ?? null

const assertMineCounters = (
	field: FieldGrid,
	geometry: FieldGeometry,
): void => {
	for (const row of field) {
		for (const cell of row) {
			if (!cell) continue
			const actualAdjacentMines = geometry
				.getSiblings(cell.position)
				.reduce(
					(count, position) =>
						count + (getCell(field, position)?.isMine ? 1 : 0),
					0,
				)
			if (cell.adjacentMines !== actualAdjacentMines) {
				fail(
					`cell ${cell.key} has adjacentMines=${String(cell.adjacentMines)}; ` +
						`expected ${String(actualAdjacentMines)}.`,
				)
			}
		}
	}
}

const assertMineCount = (field: FieldGrid, params: GameParams): void => {
	const cells = field.flat().filter((cell): cell is CellData => cell !== null)
	const mineCount = cells.filter(cell => cell.isMine).length
	if (mineCount !== params.mines) {
		fail(
			`field contains ${String(mineCount)} mines; ` +
				`expected ${String(params.mines)}.`,
		)
	}

	const flaggedCount = cells.filter(cell => cell.isFlagged).length
	if (flaggedCount > mineCount) {
		fail('field contains more flags than mines.')
	}
}

const assertStatus = (field: FieldGrid, status: GameStatus): void => {
	const cells = field.flat().filter((cell): cell is CellData => cell !== null)
	const hasExplosion = cells.some(cell => cell.isExploded)
	if (status !== 'lost' && hasExplosion) {
		fail(`status "${status}" is inconsistent with an exploded mine.`)
	}
	if (
		status === 'lost' &&
		!hasExplosion &&
		cells.some(cell => cell.isRevealed || cell.isFlagged)
	) {
		fail(
			'status "lost" without an exploded mine is only valid for a failed first-click opening.',
		)
	}
	if (
		status === 'idle' &&
		cells.some(cell => cell.isRevealed || cell.isFlagged)
	) {
		fail('status "idle" requires every cell to be covered and unflagged.')
	}

	const safeCells = cells.filter(cell => !cell.isMine)
	const allSafeCellsRevealed = safeCells.every(cell => cell.isRevealed)
	if (status === 'won' && (!allSafeCellsRevealed || hasExplosion)) {
		fail('status "won" requires every safe cell to be revealed.')
	}
	if (status === 'playing' && allSafeCellsRevealed) {
		fail('status "playing" is inconsistent with a completed field.')
	}
}

const resolveGeometry = (
	metadata: ParsedPersistedMetadata,
	providedGeometry?: FieldGeometry,
): FieldGeometry => {
	if (providedGeometry) return providedGeometry
	if (metadata.type) {
		return GeometryFactory.create({
			type: metadata.type,
			params: metadata.params,
		})
	}
	return fail(
		'pass options.geometry when the persisted state has no legacy geometry type.',
	)
}

export const validatePersistedGameState = (
	value: unknown,
	providedGeometry?: FieldGeometry,
): ValidatedPersistedGame => {
	const metadata = parseMetadata(value)
	const geometry = resolveGeometry(metadata, providedGeometry)
	const field = validateFieldGrid(
		metadata.record.field,
		metadata.params,
		geometry,
	)
	assertStatus(field, metadata.status)

	return {
		geometry,
		state: {
			version: PERSISTED_GAME_VERSION,
			params: { ...metadata.params },
			status: metadata.status,
			field,
			...(metadata.type === undefined ? {} : { type: metadata.type }),
			...(metadata.mode === undefined ? {} : { mode: metadata.mode }),
		},
	}
}

export const validateFieldGrid = (
	value: unknown,
	params: GameParams,
	geometry: FieldGeometry,
): FieldGrid => {
	const field = parseGrid(value, params, geometry)
	assertMineCounters(field, geometry)
	assertMineCount(field, params)
	return field
}
