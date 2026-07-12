import { describe, expect, it } from 'vitest'
import { GameEngine } from '../../src/core/game-engine'
import { BoardEditor } from '../../src/model/board-editor'
import { GeometryFactory } from '../../src/model/geometry/Factory'

const square = (params: { rows: number; cols: number; mines: number }) =>
	GeometryFactory.create({ type: 'square', params })

describe('BoardEditor', () => {
	it('builds a deterministic grid with mines, reveals and flags', () => {
		const params = { rows: 5, cols: 5, mines: 0 }
		const grid = BoardEditor.create({
			geometry: square(params),
			params,
		})
			.mine({ row: 0, col: 0 })
			.mine([
				{ row: 0, col: 1 },
				{ row: 4, col: 4 },
			])
			.reveal({ row: 2, col: 2 })
			.flag({ row: 0, col: 0 })
			.build()

		expect(grid[0][0]?.isMine).toBe(true)
		expect(grid[0][0]?.isFlagged).toBe(true)
		expect(grid[0][0]?.isRevealed).toBe(false)
		expect(grid[0][1]?.isMine).toBe(true)
		expect(grid[4][4]?.isMine).toBe(true)
		expect(grid[2][2]?.isRevealed).toBe(true)
		expect(grid[0][1]?.adjacentMines).toBeGreaterThan(0)
	})

	it('syncs gameParams.mines with placed mines and builds a Field', () => {
		const params = { rows: 5, cols: 5, mines: 99 }
		const editor = BoardEditor.create({
			geometry: square(params),
			params,
		}).mine([
			{ row: 1, col: 1 },
			{ row: 2, col: 2 },
		])

		expect(editor.gameParams.mines).toBe(2)

		const field = editor.buildField()
		expect(field.getFieldSnapshot().minedCells).toHaveLength(2)
	})

	it('throws on out-of-bounds positions', () => {
		const params = { rows: 5, cols: 5, mines: 0 }
		const editor = BoardEditor.create({
			geometry: square(params),
			params,
		})

		expect(() => editor.mine({ row: 9, col: 0 })).toThrow(/out of bounds/)
	})

	it('produces data usable by GameEngine', () => {
		const params = { rows: 5, cols: 5, mines: 5 }
		const geometry = square(params)
		const editor = BoardEditor.create({ geometry, params }).mine([
			{ row: 2, col: 0 },
			{ row: 2, col: 1 },
			{ row: 2, col: 2 },
			{ row: 2, col: 3 },
			{ row: 2, col: 4 },
		])

		const engine = new GameEngine({
			geometry,
			params: editor.gameParams,
			data: editor.build(),
		})

		engine.revealCell({ row: 0, col: 0 }).apply()
		expect(engine.gameSnapshot.status).toBe('playing')
		expect(engine.gameSnapshot.revealedCells.length).toBeGreaterThan(0)
	})

	it('does not RNG-fill mines when data is provided with params.mines > 0', () => {
		const params = { rows: 5, cols: 5, mines: 10 }
		const geometry = square(params)
		const editor = BoardEditor.create({ geometry, params }).mine({
			row: 0,
			col: 0,
		})

		const engine = new GameEngine({
			geometry,
			// намеренно исходные params, а не editor.gameParams
			params: { rows: 5, cols: 5, mines: 10 },
			data: editor.build(),
		})

		expect(engine.gameSnapshot.minedCells).toHaveLength(1)
		expect(engine.gameSnapshot.field[0][0]?.isMine).toBe(true)
	})

	it('cover / unflag / clearMarks reset marks without removing mines', () => {
		const params = { rows: 5, cols: 5, mines: 1 }
		const editor = BoardEditor.create({
			geometry: square(params),
			params,
		})
			.mine({ row: 0, col: 0 })
			.reveal({ row: 1, col: 1 })
			.flag({ row: 0, col: 0 })

		editor.cover({ row: 1, col: 1 }).unflag({ row: 0, col: 0 })
		let grid = editor.build()
		expect(grid[1][1]?.isRevealed).toBe(false)
		expect(grid[0][0]?.isFlagged).toBe(false)
		expect(grid[0][0]?.isMine).toBe(true)

		editor.reveal({ row: 2, col: 2 }).flag({ row: 3, col: 3 })
		editor.clearMarks([
			{ row: 2, col: 2 },
			{ row: 3, col: 3 },
		])
		grid = editor.build()
		expect(grid[2][2]?.isRevealed).toBe(false)
		expect(grid[3][3]?.isFlagged).toBe(false)
	})
})
