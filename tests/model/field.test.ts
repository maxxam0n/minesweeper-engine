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

	it('isolates draft writes while sharing untouched rows and cells', () => {
		const params = { rows: 3, cols: 3, mines: 1 }
		const geometry = new SquareGeometry(params)
		const source = new Field({
			params,
			geometry,
			data: buildGrid(params, geometry, {
				mines: [{ row: 2, col: 2 }],
			}),
		})
		const baseSnapshot = source.getFieldSnapshot()
		const draft = source.forkForMutation(baseSnapshot)

		expect(draft.grid[0]).toBe(source.grid[0])
		expect(draft.getCell({ row: 0, col: 0 })).toBe(
			source.getCell({ row: 0, col: 0 }),
		)

		const changed = draft.setCellFlagged({ row: 0, col: 0 }, true)

		expect(changed?.isFlagged).toBe(true)
		expect(source.getCell({ row: 0, col: 0 })?.isFlagged).toBe(false)
		expect(draft.grid[0]).not.toBe(source.grid[0])
		expect(draft.getCell({ row: 0, col: 0 })).not.toBe(
			source.getCell({ row: 0, col: 0 }),
		)
		expect(draft.getCell({ row: 0, col: 1 })).toBe(
			source.getCell({ row: 0, col: 1 }),
		)
		expect(draft.grid[1]).toBe(source.grid[1])

		const draftSnapshot = draft.getFieldSnapshot()
		expect(draftSnapshot.field[0]).not.toBe(baseSnapshot.field[0])
		expect(draftSnapshot.field[1]).toBe(baseSnapshot.field[1])
		expect(draftSnapshot.minedCells).toBe(baseSnapshot.minedCells)
		expect(draftSnapshot.revealedCells).toBe(baseSnapshot.revealedCells)
		expect(draftSnapshot.flaggedCells).not.toBe(baseSnapshot.flaggedCells)
	})

	it('keeps mine counter updates idempotent', () => {
		const params = { rows: 5, cols: 5, mines: 0 }
		const geometry = new SquareGeometry(params)
		const field = new Field({
			params,
			geometry,
			data: buildGrid(params, geometry),
		})
		const mine = { row: 2, col: 2 }
		const neighbor = { row: 2, col: 1 }

		expect(field.unMineCell(mine)).toBe(false)
		expect(field.getCell(neighbor)?.adjacentMines).toBe(0)

		expect(field.mineCell(mine)).toBe(true)
		expect(field.mineCell(mine)).toBe(false)
		expect(field.getCell(neighbor)?.adjacentMines).toBe(1)

		expect(field.unMineCell(mine)).toBe(true)
		expect(field.unMineCell(mine)).toBe(false)
		expect(field.getCell(neighbor)?.adjacentMines).toBe(0)
	})

	it('copies cell positions from input data', () => {
		const params = { rows: 5, cols: 5, mines: 0 }
		const geometry = new SquareGeometry(params)
		const data = buildGrid(params, geometry)
		const field = new Field({ params, geometry, data })
		const inputPosition = data[0][0]?.position

		expect(inputPosition).toBeDefined()
		Reflect.set(inputPosition!, 'row', 4)

		expect(field.getCell({ row: 0, col: 0 })?.position).toEqual({
			row: 0,
			col: 0,
		})
	})

	it('rejects random values outside the documented range', () => {
		const params = { rows: 5, cols: 5, mines: 1 }
		const geometry = new SquareGeometry(params)

		expect(() => new Field({ params, geometry, rng: () => 1 })).toThrow(
			/Expected a finite number in the range \[0, 1\)/,
		)
	})
})
