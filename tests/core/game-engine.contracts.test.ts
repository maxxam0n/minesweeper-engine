import { describe, expect, it, vi } from 'vitest'
import {
	ActionAlreadyAppliedError,
	GameEngine,
	InvalidFieldGeometryError,
	InvalidMaxHistoryError,
	InvalidPersistedGameStateError,
	StaleActionError,
} from '../../src/core/game-engine'
import { InvalidRandomValueError } from '../../src/lib/random'
import { GeometryFactory } from '../../src/model/geometry/Factory'
import type {
	FieldGeometry,
	FieldGrid,
	GameParams,
	GameStatus,
	PersistedGameState,
	Position,
} from '../../src/model/types'
import { buildGrid } from '../utils/field-builder.utils'
import { createRestrictedGeometry } from '../utils/geometry.utils'

const params: GameParams = { rows: 5, cols: 5, mines: 1 }
const geometry = GeometryFactory.create({ type: 'square', params })
const minePosition: Position = { row: 4, col: 4 }

const createPlayingState = (
	fieldGeometry: FieldGeometry = geometry,
): PersistedGameState => ({
	version: 1,
	params: { ...params },
	status: 'playing',
	field: buildGrid(params, fieldGeometry, {
		mines: [minePosition],
	}),
})

const createPlayingEngine = (): GameEngine =>
	GameEngine.fromPersistedState(createPlayingState(), { geometry })

describe('GameEngine action contracts', () => {
	it('rejects stale actions without overwriting a newer state', () => {
		const engine = createPlayingEngine()
		const first = engine.toggleFlag({ row: 0, col: 0 })
		const stale = engine.toggleFlag({ row: 0, col: 1 })

		first.apply()

		expect(() => stale.apply()).toThrow(StaleActionError)
		expect(engine.gameSnapshot.field[0]?.[0]?.isFlagged).toBe(true)
		expect(engine.gameSnapshot.field[0]?.[1]?.isFlagged).toBe(false)
	})

	it('allows each action result to be applied only once', () => {
		const engine = createPlayingEngine()
		const action = engine.toggleFlag({ row: 0, col: 0 })

		action.apply()

		expect(() => action.apply()).toThrow(ActionAlreadyAppliedError)
		expect(engine.gameSnapshot.field[0]?.[0]?.isFlagged).toBe(true)
	})

	it('does not add no-op actions to history or emit change events', () => {
		const engine = new GameEngine({
			params,
			geometry,
			data: buildGrid(params, geometry, {
				mines: [minePosition],
			}),
		})
		const listener = vi.fn()
		engine.onChange(listener)
		const before = engine.gameSnapshot
		const noOp = engine.toggleFlag({ row: 0, col: 0 })

		noOp.apply()

		expect(engine.gameSnapshot).toEqual(before)
		expect(engine.canUndo).toBe(false)
		expect(listener).not.toHaveBeenCalled()
		expect(() => noOp.apply()).toThrow(ActionAlreadyAppliedError)
	})

	it('returns the current snapshot for an invalid-position preview', () => {
		const engine = createPlayingEngine()
		const before = engine.gameSnapshot
		const invalidPosition = { row: -1, col: -1 }

		const action = engine.revealCell(invalidPosition)

		expect(action.data.actionSnapshot).toEqual(before)
		expect(action.data.actionSnapshot.status).toBe('playing')
		expect(action.data.actionSnapshot.field).toHaveLength(params.rows)
		expect(action.data.actionChanges.target.position).toEqual(invalidPosition)

		action.apply()
		expect(engine.gameSnapshot).toEqual(before)
		expect(engine.canUndo).toBe(false)
	})

	it('does not revive a failed first-click loss', () => {
		const failedParams = { rows: 5, cols: 5, mines: 2 }
		const allowed = [
			{ row: 0, col: 0 },
			{ row: 0, col: 1 },
			{ row: 0, col: 2 },
		]
		const restrictedGeometry = createRestrictedGeometry(
			failedParams,
			allowed,
		)
		const engine = new GameEngine({
			params: failedParams,
			geometry: restrictedGeometry,
			data: buildGrid(failedParams, restrictedGeometry, {
				mines: [
					{ row: 0, col: 1 },
					{ row: 0, col: 2 },
				],
			}),
		})
		engine.revealCell({ row: 0, col: 0 }).apply()
		const before = engine.gameSnapshot
		const listener = vi.fn()
		engine.onChange(listener)

		const reveal = engine.revealCell({ row: 0, col: 0 })
		const toggle = engine.toggleFlag({ row: 0, col: 0 })
		reveal.apply()
		toggle.apply()

		expect(reveal.data.actionSnapshot.status).toBe('lost')
		expect(toggle.data.actionSnapshot.status).toBe('lost')
		expect(engine.gameSnapshot).toEqual(before)
		expect(listener).not.toHaveBeenCalled()
		expect(engine.undo()).toBe(true)
		expect(engine.gameSnapshot.status).toBe('idle')
		expect(engine.undo()).toBe(false)
	})

	it('keeps won games terminal for reveal and flag actions', () => {
		const safePositions = geometry
			.getAllPositions!()
			.filter(
				position =>
					position.row !== minePosition.row ||
					position.col !== minePosition.col,
			)
		const engine = new GameEngine({
			params,
			geometry,
			data: buildGrid(params, geometry, {
				mines: [minePosition],
				revealed: safePositions,
			}),
		})
		const before = engine.gameSnapshot
		const listener = vi.fn()
		engine.onChange(listener)

		const reveal = engine.revealCell({ row: 0, col: 0 })
		const toggle = engine.toggleFlag(minePosition)
		reveal.apply()
		toggle.apply()

		expect(before.status).toBe('won')
		expect(reveal.data.actionChanges.target.isRevealed).toBe(true)
		expect(toggle.data.actionChanges.target.isMine).toBe(true)
		expect(engine.gameSnapshot).toEqual(before)
		expect(engine.canUndo).toBe(false)
		expect(listener).not.toHaveBeenCalled()
	})
})

describe('GameEngine persistence boundary', () => {
	it.each([
		['non-object state', null],
		['unsupported version', { ...createPlayingState(), version: 2 }],
		['invalid status', { ...createPlayingState(), status: 'corrupt' }],
		[
			'invalid params',
			{
				...createPlayingState(),
				params: { rows: 5, cols: Number.NaN, mines: 1 },
			},
		],
		[
			'invalid grid height',
			{
				...createPlayingState(),
				field: createPlayingState().field.slice(1),
			},
		],
	])('rejects %s', (_label, state) => {
		expect(() =>
			GameEngine.fromPersistedState(state, { geometry }),
		).toThrow()
	})

	it('rejects cells whose positions do not match their grid indices', () => {
		const state = createPlayingState()
		const cell = state.field[0]?.[0]
		if (!cell) throw new Error('Expected a cell at 0:0')
		Reflect.set(cell, 'position', { row: 1, col: 0 })

		expect(() =>
			GameEngine.fromPersistedState(state, { geometry }),
		).toThrow(InvalidPersistedGameStateError)
	})

	it('rejects sparse outer field arrays', () => {
		const state = createPlayingState()
		const sparseField: unknown[] = [...state.field]
		Reflect.deleteProperty(sparseField, '2')

		expect(() =>
			GameEngine.fromPersistedState(
				{ ...state, field: sparseField },
				{ geometry },
			),
		).toThrow(InvalidPersistedGameStateError)
	})

	it('rejects sparse field rows', () => {
		const state = createPlayingState()
		const firstRow = state.field[0]
		if (!firstRow) throw new Error('Expected the first field row')
		const sparseRow: unknown[] = [...firstRow]
		Reflect.deleteProperty(sparseRow, '2')
		const field: unknown[] = [...state.field]
		Reflect.set(field, 0, sparseRow)

		expect(() =>
			GameEngine.fromPersistedState(
				{ ...state, field },
				{ geometry },
			),
		).toThrow(InvalidPersistedGameStateError)
	})

	it('rejects nulls that disagree with the supplied geometry', () => {
		const state = createPlayingState()
		Reflect.set(state.field[0]!, 0, null)

		expect(() =>
			GameEngine.fromPersistedState(state, { geometry }),
		).toThrow(InvalidPersistedGameStateError)
	})

	it('rejects incorrect adjacent mine counters', () => {
		const state = createPlayingState()
		const neighbor = state.field[3]?.[3]
		if (!neighbor) throw new Error('Expected a cell at 3:3')
		Reflect.set(neighbor, 'adjacentMines', 0)
		Reflect.set(neighbor, 'isEmpty', true)

		expect(() =>
			GameEngine.fromPersistedState(state, { geometry }),
		).toThrow(InvalidPersistedGameStateError)
	})

	it('rejects a mine count that disagrees with params', () => {
		const state = createPlayingState()
		Reflect.set(
			state,
			'field',
			buildGrid(params, geometry, {
				mines: [
					minePosition,
					{ row: 3, col: 3 },
				],
			}),
		)

		expect(() =>
			GameEngine.fromPersistedState(state, { geometry }),
		).toThrow(InvalidPersistedGameStateError)
	})

	it('rejects a status that disagrees with the board', () => {
		const state = createPlayingState()
		Reflect.set(state, 'status', 'won')

		expect(() =>
			GameEngine.fromPersistedState(state, { geometry }),
		).toThrow(InvalidPersistedGameStateError)
	})

	it('rejects idle state containing marks', () => {
		const state: unknown = {
			...createPlayingState(),
			status: 'idle',
			field: buildGrid(params, geometry, {
				mines: [minePosition],
				flagged: [{ row: 0, col: 0 }],
			}),
		}

		expect(() =>
			GameEngine.fromPersistedState(state, { geometry }),
		).toThrow(InvalidPersistedGameStateError)
	})

	it('rejects lost state with progress but no exploded mine', () => {
		const state: unknown = {
			...createPlayingState(),
			status: 'lost',
			field: buildGrid(params, geometry, {
				mines: [minePosition],
				revealed: [{ row: 0, col: 0 }],
			}),
		}

		expect(() =>
			GameEngine.fromPersistedState(state, { geometry }),
		).toThrow(InvalidPersistedGameStateError)
	})

	it('restores a failed first-click loss without an exploded mine', () => {
		const state: unknown = {
			...createPlayingState(),
			status: 'lost',
		}

		const restored = GameEngine.fromPersistedState(state, { geometry })

		expect(restored.gameSnapshot.status).toBe('lost')
		expect(restored.gameSnapshot.explodedCells).toHaveLength(0)
	})

	it('copies persisted params and cells at the restore boundary', () => {
		const state = createPlayingState()
		const restored = GameEngine.fromPersistedState(state, { geometry })
		const sourceCell = state.field[0]?.[0]
		if (!sourceCell) throw new Error('Expected a cell at 0:0')

		Reflect.set(state.params, 'rows', 100)
		Reflect.set(sourceCell, 'isFlagged', true)

		expect(restored.serialize().params.rows).toBe(params.rows)
		expect(restored.gameSnapshot.field[0]?.[0]?.isFlagged).toBe(false)
	})

	it('returns a defensive params copy from serialize', () => {
		const engine = createPlayingEngine()

		const serialized = engine.serialize()
		Reflect.set(serialized.params, 'rows', 100)

		expect(engine.serialize().params.rows).toBe(params.rows)
	})

	it('rejects constructor data whose mine count disagrees with params', () => {
		expect(
			() =>
				new GameEngine({
					params,
					geometry,
					data: buildGrid(params, geometry),
				}),
		).toThrow(InvalidPersistedGameStateError)
	})
})

describe('GameEngine initial status', () => {
	const safePositions = geometry
		.getAllPositions!()
		.filter(
			position =>
				position.row !== minePosition.row ||
				position.col !== minePosition.col,
		)
	const cases: ReadonlyArray<{
		readonly expectedStatus: GameStatus
		readonly field: FieldGrid
		readonly label: string
	}> = [
		{
			label: 'idle for a covered board',
			expectedStatus: 'idle',
			field: buildGrid(params, geometry, { mines: [minePosition] }),
		},
		{
			label: 'playing for a revealed cell',
			expectedStatus: 'playing',
			field: buildGrid(params, geometry, {
				mines: [minePosition],
				revealed: [{ row: 0, col: 0 }],
			}),
		},
		{
			label: 'playing for a flag',
			expectedStatus: 'playing',
			field: buildGrid(params, geometry, {
				mines: [minePosition],
				flagged: [{ row: 0, col: 0 }],
			}),
		},
		{
			label: 'won when every safe cell is revealed',
			expectedStatus: 'won',
			field: buildGrid(params, geometry, {
				mines: [minePosition],
				revealed: safePositions,
			}),
		},
		{
			label: 'lost for an exploded mine',
			expectedStatus: 'lost',
			field: buildGrid(params, geometry, {
				mines: [minePosition],
				revealed: [minePosition],
			}),
		},
	]

	it.each(cases)('$label and survives serialize/restore', testCase => {
		const engine = new GameEngine({
			params,
			geometry,
			data: testCase.field,
		})

		expect(engine.gameSnapshot.status).toBe(testCase.expectedStatus)

		const restored = GameEngine.fromPersistedState(engine.serialize(), {
			geometry,
		})
		expect(restored.gameSnapshot).toEqual(engine.gameSnapshot)
	})

	it('accounts for existing flags in the initial flag budget', () => {
		const engine = new GameEngine({
			params,
			geometry,
			data: buildGrid(params, geometry, {
				mines: [minePosition],
				flagged: [{ row: 0, col: 0 }],
			}),
		})

		const action = engine.toggleFlag({ row: 0, col: 1 })
		action.apply()

		expect(action.data.actionChanges.flaggedCells).toHaveLength(0)
		expect(engine.gameSnapshot.flaggedCells).toHaveLength(1)
		expect(() =>
			GameEngine.fromPersistedState(engine.serialize(), { geometry }),
		).not.toThrow()
	})
})

describe('GameEngine option validation', () => {
	it.each([-1, 1.5, 2 ** 53, Number.NaN, Number.POSITIVE_INFINITY])(
		'rejects invalid maxHistory value %s',
		maxHistory => {
			expect(
				() =>
					new GameEngine({
						params,
						geometry,
						maxHistory,
					}),
			).toThrow(InvalidMaxHistoryError)
		},
	)

	it('validates RNG during first-click relocation', () => {
		const engine = new GameEngine({
			params,
			geometry,
			data: buildGrid(params, geometry, {
				mines: [{ row: 0, col: 0 }],
			}),
			rng: () => 1,
		})

		expect(() => engine.revealCell({ row: 0, col: 0 })).toThrow(
			InvalidRandomValueError,
		)
	})

	it('rejects duplicate positions reported by geometry', () => {
		const positions = geometry.getAllPositions?.() ?? []
		const invalidGeometry: FieldGeometry = {
			isInBoundary: position => geometry.isInBoundary(position),
			getSiblings: position => geometry.getSiblings(position),
			getAllPositions: () => [
				...positions,
				{ row: 0, col: 0 },
			],
		}

		expect(
			() =>
				new GameEngine({
					params,
					geometry: invalidGeometry,
				}),
		).toThrow(InvalidFieldGeometryError)
	})

	it('rejects asymmetric geometry adjacency', () => {
		const positions = geometry.getAllPositions?.() ?? []
		const asymmetricGeometry: FieldGeometry = {
			isInBoundary: position => geometry.isInBoundary(position),
			getAllPositions: () => positions,
			getSiblings: position => {
				const siblings = geometry.getSiblings(position)
				if (position.row !== 0 || position.col !== 1) return siblings
				return siblings.filter(
					sibling => sibling.row !== 0 || sibling.col !== 0,
				)
			},
		}

		expect(
			() =>
				new GameEngine({
					params,
					geometry: asymmetricGeometry,
				}),
		).toThrow(InvalidFieldGeometryError)
	})
})
