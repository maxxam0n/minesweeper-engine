import { describe, expect, it } from 'vitest'
import { GameEngine } from '../../src/core/game-engine'
import { generateSolvableBoard } from '../../src/core/solvable-board-generator'
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
		const params = { rows: 4, cols: 4, mines: 1 }
		expect(
			() =>
				new GameEngine({
					geometry: GeometryFactory.create({ type: 'square', params }),
					params,
				}),
		).toThrow(InvalidGameParamsError)
	})

	it('guarantees a zero opening on the first click', () => {
		const params = { rows: 5, cols: 5, mines: 2 }
		const geometry = GeometryFactory.create({ type: 'square', params })
		// Клик по «1» рядом с миной — до гарантии opening открылась бы одна клетка
		const grid = buildGrid(params, geometry, {
			mines: [
				{ row: 0, col: 0 },
				{ row: 4, col: 4 },
			],
		})

		const engine = new GameEngine({ params, geometry, data: grid })
		const start = { row: 0, col: 1 }
		const result = engine.revealCell(start)

		expect(result.data.actionChanges.explodedCells).toHaveLength(0)
		expect(result.data.actionChanges.target.adjacentMines).toBe(0)
		expect(result.data.actionChanges.revealedCells.length).toBeGreaterThan(1)
		expect(
			result.data.actionSnapshot.minedCells.some(
				cell =>
					(cell.position.row === 0 && cell.position.col === 0) ||
					(cell.position.row === 0 && cell.position.col === 1),
			),
		).toBe(false)

		result.apply()
		expect(engine.gameSnapshot.status).not.toBe('lost')
	})

	it('relocates a first-click mine and still opens an area', () => {
		const params = { rows: 5, cols: 5, mines: 1 }
		const geometry = GeometryFactory.create({ type: 'square', params })
		const grid = buildGrid(params, geometry, {
			mines: [{ row: 2, col: 2 }],
		})

		const engine = new GameEngine({
			params,
			geometry,
			data: grid,
			rng: () => 0,
		})
		const result = engine.revealCell({ row: 2, col: 2 })

		expect(result.data.actionSnapshot.status).toBe('won')
		expect(result.data.actionChanges.explodedCells).toHaveLength(0)
		expect(result.data.actionChanges.target.adjacentMines).toBe(0)
		expect(result.data.actionChanges.revealedCells.length).toBeGreaterThan(1)
		expect(
			result.data.actionSnapshot.minedCells.some(
				cell => cell.position.row === 2 && cell.position.col === 2,
			),
		).toBe(false)

		result.apply()
		expect(engine.gameSnapshot.status).toBe('won')
	})

	it('loses when first-click opening cannot relocate mines', () => {
		const params = { rows: 5, cols: 5, mines: 2 }
		const allowed = [
			{ row: 0, col: 0 },
			{ row: 0, col: 1 },
			{ row: 0, col: 2 },
		]
		const geometry = createRestrictedGeometry(params, allowed)
		const grid = buildGrid(params, geometry, {
			mines: [
				{ row: 0, col: 1 },
				{ row: 0, col: 2 },
			],
		})

		const engine = new GameEngine({ params, geometry, data: grid })
		const result = engine.revealCell({ row: 0, col: 0 })

		expect(result.data.actionSnapshot.status).toBe('lost')
		expect(result.data.actionChanges.revealedCells).toHaveLength(0)
		expect(result.data.actionChanges.explodedCells).toHaveLength(0)

		result.apply()
		expect(engine.gameSnapshot.status).toBe('lost')
	})

	it('picks relocate destination via rng among safe cells', () => {
		const params = { rows: 5, cols: 5, mines: 1 }
		const geometry = GeometryFactory.create({ type: 'square', params })
		const mines = [{ row: 0, col: 0 }]
		const start = { row: 0, col: 0 }

		const first = new GameEngine({
			params,
			geometry,
			data: buildGrid(params, geometry, { mines }),
			rng: () => 0,
		})
			.revealCell(start)
			.data.actionSnapshot.minedCells[0]?.position

		const last = new GameEngine({
			params,
			geometry,
			data: buildGrid(params, geometry, { mines }),
			rng: () => 0.999,
		})
			.revealCell(start)
			.data.actionSnapshot.minedCells[0]?.position

		expect(first).toBeDefined()
		expect(last).toBeDefined()
		expect(first).not.toEqual(last)
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

		// Chord — не первый клик: восстанавливаем уже идущую партию
		const engine = GameEngine.fromPersistedState(
			{
				version: 1,
				params,
				status: 'playing',
				field: grid,
			},
			{ geometry },
		)
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

		const engine = GameEngine.fromPersistedState(
			{
				version: 1,
				params,
				status: 'playing',
				field: grid,
			},
			{ geometry },
		)
		const chord = engine.revealCell({ row: 0, col: 1 })

		expect(chord.data.actionSnapshot.status).toBe('lost')
		expect(
			chord.data.actionChanges.explodedCells.some(
				cell => cell.position.row === 0 && cell.position.col === 0,
			),
		).toBe(true)
	})

	it('plays a solvable board from startPos without hitting a mine', () => {
		const params = { rows: 5, cols: 5, mines: 3 }
		const geometry = GeometryFactory.create({ type: 'square', params })
		const startPos = { row: 2, col: 2 }
		const board = generateSolvableBoard({
			geometry,
			params,
			startPos,
		})

		const engine = new GameEngine({
			geometry,
			params,
			data: board.data,
		})

		const first = engine.revealCell(startPos)
		expect(first.data.actionChanges.explodedCells).toHaveLength(0)
		expect(first.data.actionChanges.target.adjacentMines).toBe(0)
		first.apply()
		expect(engine.gameSnapshot.status).not.toBe('lost')
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

		const engine = GameEngine.fromPersistedState(
			{
				version: 1,
				params,
				status: 'playing',
				field: grid,
			},
			{ geometry },
		)

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
		const geometry = GeometryFactory.create({ type: 'square', params })
		const engine = new GameEngine({
			geometry,
			params,
			data: buildGrid(params, geometry, { mines: mineWallRow2 }),
		})

		engine.revealCell({ row: 0, col: 0 }).apply()
		const persisted = engine.serialize()

		expect(persisted.version).toBe(1)
		expect(persisted.type).toBeUndefined()
		expect(persisted.status).toBe('playing')

		const restored = GameEngine.fromPersistedState(persisted, { geometry })
		expect(restored.gameSnapshot.status).toBe('playing')
		expect(restored.gameSnapshot.revealedCells.length).toBe(
			engine.gameSnapshot.revealedCells.length,
		)
		expect(restored.canUndo).toBe(false)
	})

	it('restores legacy persisted state that still has type', () => {
		const params = { rows: 5, cols: 5, mines: 5 }
		const geometry = GeometryFactory.create({ type: 'square', params })
		const engine = new GameEngine({
			geometry,
			params,
			data: buildGrid(params, geometry, { mines: mineWallRow2 }),
		})
		engine.revealCell({ row: 0, col: 0 }).apply()
		const persisted = {
			...engine.serialize(),
			type: 'square' as const,
		}

		const restored = GameEngine.fromPersistedState(persisted)
		expect(restored.gameSnapshot.status).toBe('playing')
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
