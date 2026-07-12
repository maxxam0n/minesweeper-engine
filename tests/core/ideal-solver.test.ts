import { describe, expect, it } from 'vitest'
import { IdealSolver } from '../../src/core/ideal-solver'
import { Field } from '../../src/model/Field'
import { SquareGeometry } from '../../src/model/geometry/Square'
import { buildGrid, listPositions } from '../utils/field-builder.utils'

describe('IdealSolver.getMetrics (classic 3BV)', () => {
	it('returns 3BV = 1 for an empty field (single opening)', () => {
		const params = { rows: 5, cols: 5, mines: 0 }
		const solver = new IdealSolver({
			geometry: new SquareGeometry(params),
			params,
		})

		expect(solver.getMetrics()).toEqual({ total: 1, remaining: 1 })
	})

	it('keeps total from a pristine board when everything is already revealed', () => {
		const params = { rows: 5, cols: 5, mines: 0 }
		const geometry = new SquareGeometry(params)
		const revealed = listPositions(params, geometry)
		const grid = buildGrid(params, geometry, { revealed })
		const field = new Field({ params, geometry, data: grid })

		const solver = new IdealSolver(field)
		expect(solver.getMetrics()).toEqual({ total: 1, remaining: 0 })
	})

	it('counts openings and isolated numbers on a known layout', () => {
		// 3 opening + 1 isolated digit = 3BV 4
		// . 1 M 1 .
		// 1 1 M 1 1
		// M M M M M
		// 1 1 M 2 M
		// . 1 M M M
		const params = { rows: 5, cols: 5, mines: 12 }
		const geometry = new SquareGeometry(params)
		const mines = [
			{ row: 0, col: 2 },
			{ row: 1, col: 2 },
			{ row: 2, col: 0 },
			{ row: 2, col: 1 },
			{ row: 2, col: 2 },
			{ row: 2, col: 3 },
			{ row: 2, col: 4 },
			{ row: 3, col: 2 },
			{ row: 3, col: 4 },
			{ row: 4, col: 2 },
			{ row: 4, col: 3 },
			{ row: 4, col: 4 },
		]
		const grid = buildGrid(params, geometry, { mines })
		const field = new Field({ params, geometry, data: grid })

		expect(new IdealSolver(field).getMetrics()).toEqual({
			total: 4,
			remaining: 4,
		})
	})

	it('decrements remaining after an opening is revealed', () => {
		const params = { rows: 5, cols: 5, mines: 12 }
		const geometry = new SquareGeometry(params)
		const mines = [
			{ row: 0, col: 2 },
			{ row: 1, col: 2 },
			{ row: 2, col: 0 },
			{ row: 2, col: 1 },
			{ row: 2, col: 2 },
			{ row: 2, col: 3 },
			{ row: 2, col: 4 },
			{ row: 3, col: 2 },
			{ row: 3, col: 4 },
			{ row: 4, col: 2 },
			{ row: 4, col: 3 },
			{ row: 4, col: 4 },
		]
		const grid = buildGrid(params, geometry, {
			mines,
			revealed: [{ row: 0, col: 0 }],
		})
		const field = new Field({ params, geometry, data: grid })

		const { total, remaining } = new IdealSolver(field).getMetrics()
		expect(total).toBe(4)
		expect(remaining).toBe(3)
	})

	it('counts a single isolated number as 3BV = 1', () => {
		const params = { rows: 2, cols: 2, mines: 3 }
		const geometry = new SquareGeometry(params)
		const grid = buildGrid(params, geometry, {
			mines: [
				{ row: 0, col: 0 },
				{ row: 0, col: 1 },
				{ row: 1, col: 0 },
			],
		})
		const field = new Field({ params, geometry, data: grid })

		expect(new IdealSolver(field).getMetrics()).toEqual({
			total: 1,
			remaining: 1,
		})
	})
})

describe('IdealSolver.efficiency', () => {
	it('computes classic IOE as 3BV / clicks', () => {
		expect(IdealSolver.efficiency(50, 50)).toBe(1)
		expect(IdealSolver.efficiency(50, 40)).toBe(1.25)
		expect(IdealSolver.efficiency(50, 100)).toBe(0.5)
	})

	it('returns 0 when clicks are non-positive', () => {
		expect(IdealSolver.efficiency(10, 0)).toBe(0)
		expect(IdealSolver.efficiency(10, -1)).toBe(0)
	})
})
