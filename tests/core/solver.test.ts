import { describe, expect, it } from 'vitest'
import { Field } from '../../src/model/Field'
import { SquareGeometry } from '../../src/model/geometry/Square'
import { Solver } from '../../src/core/field-solver'
import { buildGrid } from '../utils/field-builder.utils'

describe('Solver.solve', () => {
	it('infers a certain mine from a constrained number', () => {
		const params = { rows: 5, cols: 5, mines: 1 }
		const geometry = new SquareGeometry(params)
		const mines = [{ row: 2, col: 2 }]
		const revealed = [
			{ row: 1, col: 0 },
			{ row: 1, col: 1 },
			{ row: 1, col: 2 },
			{ row: 2, col: 0 },
			{ row: 2, col: 1 },
			{ row: 3, col: 0 },
			{ row: 3, col: 1 },
			{ row: 3, col: 2 },
		]

		const grid = buildGrid(params, geometry, { mines, revealed })
		const field = new Field({ params, geometry, data: grid })

		const solver = new Solver(field)
		const probabilities = solver.solve()
		const mineProb = probabilities.find(
			p => p.position.row === 2 && p.position.col === 2,
		)

		expect(mineProb?.value).toBe(1)
	})
})
