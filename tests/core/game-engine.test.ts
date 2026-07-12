import { describe, expect, it } from 'vitest'
import { GameEngine } from '../../src/core/game-engine'
import { InvalidGameParamsError } from '../../src/lib/validate-params'
import { GeometryFactory } from '../../src/model/geometry/Factory'
import { buildGrid } from '../utils/field-builder.utils'
import { createRestrictedGeometry } from '../utils/geometry.utils'

/** Стена мин, чтобы первый клик сверху не открывал всё поле. */
const mineWallRow2 = [
	{ row: 2, col: 0 },
	{ row: 2, col: 1 },
	{ row: 2, col: 2 },
	{ row: 2, col: 3 },
	{ row: 2, col: 4 },
]

describe('GameEngine', () => {
	it('throws InvalidGameParamsError for invalid params', () => {
		expect(
			() =>
				new GameEngine({
					type: 'square',
					params: { rows: 4, cols: 4, mines: 1 },
				}),
		).toThrow(InvalidGameParamsError)
	})

	it('relocates a mine on the first click', () => {
		const params = { rows: 5, cols: 5, mines: 1 }
		const geometry = GeometryFactory.create({ type: 'square', params })
		const grid = buildGrid(params, geometry, {
			mines: [{ row: 2, col: 2 }],
		})

		const engine = new GameEngine({ params, geometry, data: grid })
		const result = engine.revealCell({ row: 2, col: 2 })

		expect(result.data.actionSnapshot.status).toBe('won')
		expect(result.data.actionChanges.explodedCells).toHaveLength(0)
		expect(
			result.data.actionSnapshot.minedCells.some(
				cell => cell.position.row === 2 && cell.position.col === 2,
			),
		).toBe(false)
		expect(
			result.data.actionChanges.revealedCells.some(
				cell => cell.position.row === 2 && cell.position.col === 2,
			),
		).toBe(true)

		result.apply()
		expect(engine.gameSnapshot.status).toBe('won')
	})

	it('loses when revealing a mine after the first move', () => {
		const params = { rows: 5, cols: 5, mines: 5 }
		const geometry = GeometryFactory.create({ type: 'square', params })
		const grid = buildGrid(params, geometry, { mines: mineWallRow2 })

		const engine = new GameEngine({ params, geometry, data: grid })
		engine.revealCell({ row: 0, col: 0 }).apply()
		expect(engine.gameSnapshot.status).toBe('playing')

		const loss = engine.revealCell({ row: 2, col: 2 })
		expect(loss.data.actionSnapshot.status).toBe('lost')
		expect(loss.data.actionChanges.explodedCells).toHaveLength(1)

		loss.apply()
		expect(engine.gameSnapshot.status).toBe('lost')
	})

	it('chords a revealed number when adjacent flags match the count', () => {
		const params = { rows: 5, cols: 5, mines: 1 }
		const geometry = GeometryFactory.create({ type: 'square', params })
		const grid = buildGrid(params, geometry, {
			mines: [{ row: 0, col: 0 }],
			revealed: [{ row: 0, col: 1 }],
			flagged: [{ row: 0, col: 0 }],
		})

		const engine = new GameEngine({ params, geometry, data: grid })
		// Первый клик по уже открытой «1» с верным флагом = chord
		const chord = engine.revealCell({ row: 0, col: 1 })

		expect(chord.data.actionChanges.explodedCells).toHaveLength(0)
		expect(chord.data.actionChanges.revealedCells.length).toBeGreaterThan(0)
		expect(
			chord.data.actionChanges.revealedCells.some(
				cell => cell.position.row === 1 && cell.position.col === 0,
			),
		).toBe(true)

		chord.apply()
		expect(engine.gameSnapshot.status).toBe('won')
	})

	it('loses on a wrong chord', () => {
		const params = { rows: 5, cols: 5, mines: 1 }
		const geometry = GeometryFactory.create({ type: 'square', params })
		const grid = buildGrid(params, geometry, {
			mines: [{ row: 0, col: 0 }],
			revealed: [{ row: 0, col: 1 }],
			flagged: [{ row: 1, col: 1 }],
		})

		const engine = new GameEngine({ params, geometry, data: grid })
		const chord = engine.revealCell({ row: 0, col: 1 })

		expect(chord.data.actionSnapshot.status).toBe('lost')
		expect(
			chord.data.actionChanges.explodedCells.some(
				cell => cell.position.row === 0 && cell.position.col === 0,
			),
		).toBe(true)
	})

	it('in no-guessing mode redirects uncertain mine click to a flag', () => {
		const params = { rows: 5, cols: 5, mines: 2 }
		const geometry = GeometryFactory.create({ type: 'square', params })
		const grid = buildGrid(params, geometry, {
			mines: [
				{ row: 0, col: 0 },
				{ row: 0, col: 1 },
			],
			revealed: [{ row: 1, col: 0 }],
		})

		const engine = new GameEngine({
			params,
			geometry,
			data: grid,
			mode: 'no-guessing',
		})
		engine.revealCell({ row: 1, col: 0 }).apply()

		const redirected = engine.revealCell({ row: 0, col: 0 })
		expect(redirected.data.actionChanges.explodedCells).toHaveLength(0)
		expect(redirected.data.actionChanges.flaggedCells).toHaveLength(1)
		expect(redirected.data.actionChanges.flaggedCells[0].position).toEqual({
			row: 0,
			col: 0,
		})

		redirected.apply()
		expect(engine.gameSnapshot.status).toBe('playing')
		expect(
			engine.gameSnapshot.flaggedCells.some(
				cell => cell.position.row === 0 && cell.position.col === 0,
			),
		).toBe(true)
	})

	it('does not mutate engine status until apply', () => {
		const params = { rows: 5, cols: 5, mines: 5 }
		const geometry = GeometryFactory.create({ type: 'square', params })
		const grid = buildGrid(params, geometry, { mines: mineWallRow2 })

		const engine = new GameEngine({ params, geometry, data: grid })
		const before = engine.gameSnapshot
		const result = engine.revealCell({ row: 0, col: 0 })

		expect(before.status).toBe('idle')
		expect(result.data.actionSnapshot.status).toBe('playing')
		expect(engine.gameSnapshot.status).toBe('idle')
	})

	it('toggles flags only during active play', () => {
		const params = { rows: 5, cols: 5, mines: 1 }
		const geometry = GeometryFactory.create({ type: 'square', params })
		const grid = buildGrid(params, geometry, {
			mines: [{ row: 2, col: 2 }],
		})

		const engine = new GameEngine({ params, geometry, data: grid })
		engine.revealCell({ row: 2, col: 1 }).apply()

		const flag = engine.toggleFlag({ row: 1, col: 1 })
		expect(flag.data.actionChanges.flaggedCells).toHaveLength(1)
		flag.apply()

		const ignored = engine.toggleFlag({ row: 3, col: 3 })
		expect(ignored.data.actionChanges.flaggedCells).toHaveLength(0)
		ignored.apply()

		const unflag = engine.toggleFlag({ row: 1, col: 1 })
		expect(unflag.data.actionChanges.unflaggedCells).toHaveLength(1)
	})

	it('wins based on valid geometry cells', () => {
		const params = { rows: 5, cols: 5, mines: 0 }
		const allowed = [
			{ row: 0, col: 0 },
			{ row: 0, col: 1 },
			{ row: 0, col: 2 },
			{ row: 1, col: 0 },
			{ row: 1, col: 1 },
			{ row: 1, col: 2 },
		]
		const geometry = createRestrictedGeometry(params, allowed)
		const grid = buildGrid(params, geometry)
		const engine = new GameEngine({ params, geometry, data: grid })

		const result = engine.revealCell({ row: 0, col: 0 })

		expect(result.data.actionSnapshot.status).toBe('won')
		result.apply()
		expect(engine.gameSnapshot.status).toBe('won')
	})

	it('undo restores the previous applied state', () => {
		const params = { rows: 5, cols: 5, mines: 5 }
		const geometry = GeometryFactory.create({ type: 'square', params })
		const grid = buildGrid(params, geometry, { mines: mineWallRow2 })

		const engine = new GameEngine({ params, geometry, data: grid })
		expect(engine.canUndo).toBe(false)

		engine.revealCell({ row: 0, col: 0 }).apply()
		expect(engine.canUndo).toBe(true)
		expect(engine.gameSnapshot.status).toBe('playing')

		expect(engine.undo()).toBe(true)
		expect(engine.gameSnapshot.status).toBe('idle')
		expect(engine.canUndo).toBe(false)
	})

	it('serialize / fromPersistedState round-trips status and field', () => {
		const params = { rows: 5, cols: 5, mines: 5 }
		const engine = new GameEngine({
			type: 'square',
			params,
			data: buildGrid(
				params,
				GeometryFactory.create({ type: 'square', params }),
				{ mines: mineWallRow2 },
			),
		})

		engine.revealCell({ row: 0, col: 0 }).apply()
		const persisted = engine.serialize()

		expect(persisted.version).toBe(1)
		expect(persisted.type).toBe('square')
		expect(persisted.status).toBe('playing')

		const restored = GameEngine.fromPersistedState(persisted)
		expect(restored.gameSnapshot.status).toBe('playing')
		expect(restored.gameSnapshot.revealedCells.length).toBe(
			engine.gameSnapshot.revealedCells.length,
		)
		expect(restored.canUndo).toBe(false)
	})

	it('uses injected createAnalyzer in no-guessing mode', () => {
		const params = { rows: 5, cols: 5, mines: 2 }
		const geometry = GeometryFactory.create({ type: 'square', params })
		const grid = buildGrid(params, geometry, {
			mines: [
				{ row: 0, col: 0 },
				{ row: 0, col: 1 },
			],
			revealed: [{ row: 1, col: 0 }],
		})

		let analyzerCalls = 0
		const engine = new GameEngine({
			params,
			geometry,
			data: grid,
			mode: 'no-guessing',
			createAnalyzer: () => {
				analyzerCalls += 1
				return {
					solve: () => [],
					isGuessingState: () => true,
				}
			},
		})

		engine.revealCell({ row: 1, col: 0 }).apply()
		engine.revealCell({ row: 0, col: 0 }).apply()

		expect(analyzerCalls).toBe(1)
		expect(
			engine.gameSnapshot.flaggedCells.some(
				cell => cell.position.row === 0 && cell.position.col === 0,
			),
		).toBe(true)
	})

	it('notifies onChange listeners on apply and undo', () => {
		const params = { rows: 5, cols: 5, mines: 5 }
		const geometry = GeometryFactory.create({ type: 'square', params })
		const grid = buildGrid(params, geometry, { mines: mineWallRow2 })
		const engine = new GameEngine({ params, geometry, data: grid })

		const reasons: string[] = []
		const unsubscribe = engine.onChange(event => {
			reasons.push(event.reason)
		})

		engine.revealCell({ row: 0, col: 0 }).apply()
		engine.undo()
		unsubscribe()
		engine.revealCell({ row: 0, col: 0 }).apply()

		expect(reasons).toEqual(['apply', 'undo'])
	})
})
