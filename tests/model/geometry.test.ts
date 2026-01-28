import { describe, expect, it } from 'vitest'
import { createKey } from '../../src/lib/utils'
import { HexagonalGeometry } from '../../src/model/geometry/Hexagonal'
import { SquareGeometry } from '../../src/model/geometry/Square'
import { TriangularGeometry } from '../../src/model/geometry/Triangle'

const params = { rows: 5, cols: 5, mines: 3 }

describe('Geometry', () => {
	it('SquareGeometry respects boundaries', () => {
		const geometry = new SquareGeometry(params)
		const siblings = geometry.getSiblings({ row: 0, col: 0 })
		const keys = siblings.map(createKey)

		expect(keys).toContain('1-0')
		expect(keys).toContain('0-1')
		expect(keys).toContain('1-1')
		expect(keys).not.toContain('0-0')
		expect(siblings).toHaveLength(3)
	})

	it('SquareGeometry returns 8 neighbors for a center cell', () => {
		const geometry = new SquareGeometry(params)
		const siblings = geometry.getSiblings({ row: 2, col: 2 })

		expect(siblings).toHaveLength(8)
	})

	it('HexagonalGeometry returns 6 neighbors for a center cell', () => {
		const geometry = new HexagonalGeometry(params)
		const siblings = geometry.getSiblings({ row: 2, col: 2 })

		expect(siblings).toHaveLength(6)
	})

	it('TriangularGeometry returns 12 neighbors for a center cell', () => {
		const geometry = new TriangularGeometry(params)
		const siblings = geometry.getSiblings({ row: 2, col: 2 })

		expect(siblings).toHaveLength(12)
	})
})
