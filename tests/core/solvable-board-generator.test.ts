import { describe, expect, it } from 'vitest'
import {
	generateSolvableBoard,
	SolvableBoardGenerationError,
} from '../../src/core/solvable-board-generator'
import { Field } from '../../src/model/Field'
import { GeometryFactory } from '../../src/model/geometry/Factory'
import { Solver } from '../../src/core/field-solver'

describe('generateSolvableBoard', () => {
	it('returns a closed board solvable from startPos', () => {
		const params = { rows: 5, cols: 5, mines: 3 }
		const geometry = GeometryFactory.create({ type: 'square', params })
		const startPos = { row: 2, col: 2 }
		const phases: string[] = []

		const board = generateSolvableBoard({
			geometry,
			params,
			startPos,
			onProgress: p => {
				phases.push(p.phase)
			},
		})

		expect(board.startPos).toEqual(startPos)
		expect(board.attempts).toBeGreaterThanOrEqual(1)
		expect(phases).toContain('sample')
		expect(phases).toContain('simulate')

		const field = new Field({ params, geometry, data: board.data })
		expect(field.getCell(startPos)?.isMine).toBe(false)
		expect(field.getFieldSnapshot().revealedCells).toHaveLength(0)

		const sim = field.cloneSelf()
		for (const cell of sim.getAreaToReveal(startPos)) {
			cell.isRevealed = true
		}

		let guard = 0
		while (guard++ < 200) {
			const cells = sim.grid.flat().filter(c => c !== null)
			if (cells.every(c => c.isMine || c.isRevealed)) break

			const probs = new Solver(sim).solve()
			const safes = probs.filter(p => p.value === 0)
			expect(safes.length).toBeGreaterThan(0)

			for (const hint of safes) {
				const cell = sim.getCell(hint.position)
				if (!cell || cell.isRevealed || cell.isMine) continue
				for (const area of sim.getAreaToReveal(hint.position)) {
					area.isRevealed = true
				}
			}
		}

		const cells = sim.grid.flat().filter(c => c !== null)
		expect(cells.every(c => c.isMine || c.isRevealed)).toBe(true)
	})

	it('throws when analyzer never reports certain safe cells', () => {
		const params = { rows: 5, cols: 5, mines: 10 }
		expect(() =>
			generateSolvableBoard({
				geometry: GeometryFactory.create({ type: 'square', params }),
				params,
				startPos: { row: 0, col: 0 },
				maxAttempts: 3,
				createAnalyzer: () => ({
					solve: () => [],
					isGuessingState: () => true,
				}),
			}),
		).toThrow(SolvableBoardGenerationError)
	})

	it('rejects startPos outside the field', () => {
		const params = { rows: 5, cols: 5, mines: 3 }
		expect(() =>
			generateSolvableBoard({
				geometry: GeometryFactory.create({ type: 'square', params }),
				params,
				startPos: { row: 99, col: 99 },
			}),
		).toThrow(/startPos/)
	})
})
