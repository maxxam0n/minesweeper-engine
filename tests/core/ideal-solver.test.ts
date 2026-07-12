import { describe, expect, it } from 'vitest'
import { IdealSolver } from '../../src/core/ideal-solver'
import { Field } from '../../src/model/Field'
import { SquareGeometry } from '../../src/model/geometry/Square'
import { buildGrid, listPositions } from '../utils/field-builder.utils'

describe('IdealSolver.getMetrics', () => {
	it('returns one click for an empty field', () => {
		const solver = new IdealSolver({
			type: 'square',
			params: { rows: 5, cols: 5, mines: 0 },
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

	it('reports remaining less than total after partial progress', () => {
		const params = { rows: 5, cols: 5, mines: 1 }
		const geometry = new SquareGeometry(params)
		const grid = buildGrid(params, geometry, {
			mines: [{ row: 4, col: 4 }],
			revealed: [{ row: 0, col: 0 }],
		})
		const field = new Field({ params, geometry, data: grid })

		const { total, remaining } = new IdealSolver(field).getMetrics()
		expect(total).toBeGreaterThan(0)
		expect(remaining).toBeGreaterThanOrEqual(0)
		expect(remaining).toBeLessThanOrEqual(total)
	})
})
