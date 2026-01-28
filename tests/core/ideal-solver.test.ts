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

	it('returns zero when all safe cells are already revealed', () => {
		const params = { rows: 5, cols: 5, mines: 0 }
		const geometry = new SquareGeometry(params)
		const revealed = listPositions(params, geometry)
		const grid = buildGrid(params, geometry, { revealed })
		const field = new Field({ params, geometry, data: grid })

		const solver = new IdealSolver(field)
		expect(solver.getMetrics()).toEqual({ total: 0, remaining: 0 })
	})
})
