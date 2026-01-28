import { describe, expect, it } from 'vitest'
import { GameEngine } from '../../src/core/game-engine'
import { GeometryFactory } from '../../src/model/geometry/Factory'
import { buildGrid } from '../utils/field-builder.utils'
import { createRestrictedGeometry } from '../utils/geometry.utils'

describe('GameEngine', () => {
	it('returns empty snapshots for invalid params', () => {
		const engine = new GameEngine({
			type: 'square',
			params: { rows: 4, cols: 4, mines: 1 },
		})

		expect(engine.gameSnapshot.status).toBe('idle')
		expect(engine.gameSnapshot.field).toHaveLength(0)

		const result = engine.revealCell({ row: 0, col: 0 })
		expect(result.data.actionSnapshot.status).toBe('idle')
		expect(result.data.actionSnapshot.field).toHaveLength(0)
		expect(result.data.actionChanges.target.position).toEqual({
			row: 0,
			col: 0,
		})

		result.apply()
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
})
