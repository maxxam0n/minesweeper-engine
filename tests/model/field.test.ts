import { describe, expect, it } from 'vitest'
import { createKey } from '../../src/lib/utils'
import { Field } from '../../src/model/Field'
import { SquareGeometry } from '../../src/model/geometry/Square'
import { buildGrid } from '../utils/field-builder.utils'
import { createRestrictedGeometry } from '../utils/geometry.utils'

describe('Field.getAreaToReveal', () => {
	it('reveals all safe cells for a single corner mine', () => {
		const params = { rows: 5, cols: 5, mines: 1 }
		const geometry = new SquareGeometry(params)
		const grid = buildGrid(params, geometry, {
			mines: [{ row: 4, col: 4 }],
		})

		const field = new Field({ params, geometry, data: grid })
		const area = field.getAreaToReveal({ row: 0, col: 0 })

		expect(area).toHaveLength(24)
		expect(
			area.some(cell => cell.position.row === 4 && cell.position.col === 4),
		).toBe(false)
	})

	it('places mines only inside a restricted geometry', () => {
		const params = { rows: 4, cols: 4, mines: 6 }
		const allowed = [
			{ row: 0, col: 0 },
			{ row: 0, col: 1 },
			{ row: 1, col: 0 },
			{ row: 1, col: 1 },
		]
		const geometry = createRestrictedGeometry(params, allowed)
		const field = new Field({ params, geometry, rng: () => 0 })
		const minedCells = field.getFieldSnapshot().minedCells
		const allowedSet = new Set(allowed.map(createKey))

		expect(minedCells).toHaveLength(allowed.length)
		expect(
			minedCells.every(cell => allowedSet.has(createKey(cell.position))),
		).toBe(true)
	})

	it('does not place random mines when data grid is provided', () => {
		const params = { rows: 3, cols: 3, mines: 5 }
		const geometry = new SquareGeometry(params)
		const grid = buildGrid(params, geometry, {
			mines: [{ row: 1, col: 1 }],
		})

		const field = new Field({ params, geometry, data: grid, rng: () => 0 })
		expect(field.getFieldSnapshot().minedCells).toHaveLength(1)
	})
})
