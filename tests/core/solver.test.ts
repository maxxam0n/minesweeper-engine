import { describe, expect, it } from 'vitest'
import { createKey } from '../../src/lib/utils'
import { Solver } from '../../src/core/field-solver'
import { DirectInference } from '../../src/core/field-solver/direct-inference'
import { ProbabilityStore } from '../../src/core/field-solver/probability-store'
import { RegionEnumerator } from '../../src/core/field-solver/region-enumerator'
import { Cell } from '../../src/model/Cell'
import { Field } from '../../src/model/Field'
import { SquareGeometry } from '../../src/model/geometry/Square'
import type {
	Constraint,
	FieldView,
} from '../../src/model/field-solver.types'
import type { CellData, MineProbability, Position } from '../../src/model/types'
import { buildGrid } from '../utils/field-builder.utils'

const findProbability = (
	probabilities: MineProbability[],
	position: Position,
): number | undefined =>
	probabilities.find(
		probability =>
			probability.position.row === position.row &&
			probability.position.col === position.col,
		)?.value

const createFieldView = (
	revealedCells: readonly CellData[],
	siblingsByCell: ReadonlyMap<string, readonly CellData[]>,
): FieldView => ({
	getFieldSnapshot: () => ({
		field: [revealedCells],
		minedCells: [],
		explodedCells: [],
		flaggedCells: [],
		notFoundMines: [],
		errorFlags: [],
		revealedCells,
	}),
	getSiblings: position => [
		...(siblingsByCell.get(createKey(position)) ?? []),
	],
})

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

	it('does not treat a wrong player flag as a known mine', () => {
		const params = { rows: 5, cols: 5, mines: 1 }
		const geometry = new SquareGeometry(params)
		const mines = [{ row: 0, col: 0 }]
		const revealed = [{ row: 0, col: 1 }]
		// Ошибочный флаг на безопасной клетке — solver не должен считать её миной
		const flagged = [{ row: 1, col: 1 }]

		const grid = buildGrid(params, geometry, { mines, revealed, flagged })
		const field = new Field({ params, geometry, data: grid })

		const solver = new Solver(field)
		const probabilities = solver.solve()
		const flaggedProb = probabilities.find(
			p => p.position.row === 1 && p.position.col === 1,
		)

		expect(flaggedProb?.value).not.toBe(1)
	})

	it('combines non-adjacent constraints through shared closed cells', () => {
		const params = { rows: 5, cols: 5, mines: 6 }
		const geometry = new SquareGeometry(params)
		const shared = [
			{ row: 1, col: 2 },
			{ row: 2, col: 2 },
			{ row: 3, col: 2 },
		]
		const certainSafe = [
			{ row: 1, col: 0 },
			{ row: 1, col: 1 },
			{ row: 2, col: 0 },
			{ row: 3, col: 0 },
			{ row: 3, col: 1 },
		]
		const certainMines = [
			{ row: 1, col: 3 },
			{ row: 1, col: 4 },
			{ row: 2, col: 4 },
			{ row: 3, col: 3 },
			{ row: 3, col: 4 },
		]
		const revealed = [
			{ row: 2, col: 1 },
			{ row: 2, col: 3 },
		]
		const mines = [shared[0], ...certainMines]
		const grid = buildGrid(params, geometry, { mines, revealed })
		const solver = new Solver(new Field({ params, geometry, data: grid }))

		const regions = solver.createConnectedRegions()
		const probabilities = solver.solve()

		expect(regions).toHaveLength(1)
		expect(regions[0]).toHaveLength(2)
		for (const position of certainSafe) {
			expect(findProbability(probabilities, position)).toBe(0)
		}
		for (const position of certainMines) {
			expect(findProbability(probabilities, position)).toBe(1)
		}
		for (const position of shared) {
			expect(findProbability(probabilities, position)).toBeCloseTo(1 / 3)
		}
	})

	it('conditions overlapping constraints on exact deductions', () => {
		const mineConstraint = Cell.createCell({
			position: { row: 0, col: 0 },
			adjacentMines: 1,
			isRevealed: true,
		}).toData()
		const safeConstraint = Cell.createCell({
			position: { row: 0, col: 1 },
			adjacentMines: 1,
			isRevealed: true,
		}).toData()
		const ratioConstraint = Cell.createCell({
			position: { row: 0, col: 2 },
			adjacentMines: 1,
			isRevealed: true,
		}).toData()
		const mine = Cell.createCell({
			position: { row: 1, col: 0 },
			isMine: true,
		}).toData()
		const exactSafe = Cell.createCell({
			position: { row: 1, col: 1 },
		}).toData()
		const unresolved = [
			Cell.createCell({
				position: { row: 1, col: 2 },
				isMine: true,
			}).toData(),
			Cell.createCell({ position: { row: 1, col: 3 } }).toData(),
		]
		const field = createFieldView(
			[mineConstraint, safeConstraint, ratioConstraint],
			new Map([
				[mineConstraint.key, [mine]],
				[safeConstraint.key, [mine, exactSafe]],
				[ratioConstraint.key, [exactSafe, ...unresolved]],
			]),
		)

		const probabilities = new Solver(field).solve()

		expect(findProbability(probabilities, mine.position)).toBe(1)
		expect(findProbability(probabilities, exactSafe.position)).toBe(0)
		for (const cell of unresolved) {
			expect(findProbability(probabilities, cell.position)).toBe(0.5)
		}
	})
})

describe('ProbabilityStore', () => {
	it('replaces a heuristic probability with an exact result', () => {
		const probabilities = new ProbabilityStore()
		const position = { row: 2, col: 4 }
		const key = '4-2'

		probabilities.setProbability(key, 0.25)

		expect(probabilities.setExact(key, 1, position)).toBe(true)
		expect(probabilities.get(key)).toEqual({ position, value: 1 })
	})
})

describe('DirectInference', () => {
	it('excludes exact safe cells from local probability ratios', () => {
		const params = { rows: 2, cols: 2, mines: 1 }
		const geometry = new SquareGeometry(params)
		const exactSafe = { row: 0, col: 1 }
		const unresolved = [
			{ row: 1, col: 0 },
			{ row: 1, col: 1 },
		]
		const grid = buildGrid(params, geometry, {
			mines: [unresolved[0]],
			revealed: [{ row: 0, col: 0 }],
		})
		const field = new Field({ params, geometry, data: grid })
		const probabilities = new ProbabilityStore()
		const inference = new DirectInference(field, probabilities)
		probabilities.setExact('1-0', 0, exactSafe)

		inference.inferByLocalRatios(field.getFieldSnapshot().revealedCells)

		expect(findProbability(probabilities.getAll(), exactSafe)).toBe(0)
		for (const position of unresolved) {
			expect(findProbability(probabilities.getAll(), position)).toBe(0.5)
		}
	})

	it('removes exact safe cells before comparing constraint subsets', () => {
		const subsetCell = Cell.createCell({
			position: { row: 0, col: 0 },
			adjacentMines: 1,
			isRevealed: true,
		}).toData()
		const supersetCell = Cell.createCell({
			position: { row: 0, col: 1 },
			adjacentMines: 1,
			isRevealed: true,
		}).toData()
		const exactSafe = Cell.createCell({
			position: { row: 1, col: 0 },
		}).toData()
		const shared = Cell.createCell({
			position: { row: 1, col: 1 },
			isMine: true,
		}).toData()
		const inferredSafe = Cell.createCell({
			position: { row: 1, col: 2 },
		}).toData()
		const field = createFieldView(
			[subsetCell, supersetCell],
			new Map([
				[subsetCell.key, [exactSafe, shared]],
				[supersetCell.key, [shared, inferredSafe]],
			]),
		)
		const probabilities = new ProbabilityStore()
		const inference = new DirectInference(field, probabilities)
		probabilities.setExact(exactSafe.key, 0, exactSafe.position)

		expect(
			inference.inferBySubsetDifference(
				field.getFieldSnapshot().revealedCells,
			),
		).toBe(true)
		expect(findProbability(probabilities.getAll(), inferredSafe.position)).toBe(
			0,
		)
	})
})

describe('RegionEnumerator', () => {
	it('short-circuits satisfiability checks for a medium balanced region', () => {
		const probabilities = new ProbabilityStore()
		const enumerator = new RegionEnumerator(probabilities)
		const vars = Array.from({ length: 30 }, (_, index) => `${index}-0`)
		const constraint: Constraint = {
			cell: Cell.createCell({ position: { row: 0, col: 0 } }).toData(),
			neighbors: vars,
			mines: 15,
		}

		expect(enumerator.evaluateSubregion(vars, [constraint])).toBe(false)
		expect(probabilities.getAll()).toEqual([])
	})

	it('keeps exact deductions for medium regions', () => {
		const probabilities = new ProbabilityStore()
		const enumerator = new RegionEnumerator(probabilities)
		const vars = Array.from({ length: 19 }, (_, index) => `${index}-0`)
		const constraint: Constraint = {
			cell: Cell.createCell({ position: { row: 0, col: 0 } }).toData(),
			neighbors: vars,
			mines: 0,
		}

		probabilities.setProbability(vars[0], 0.5)

		expect(enumerator.evaluateSubregion(vars, [constraint])).toBe(true)
		expect(probabilities.getAll()).toHaveLength(vars.length)
		expect(probabilities.getAll().every(result => result.value === 0)).toBe(
			true,
		)
	})

	it('conditions enumeration on exact values', () => {
		const probabilities = new ProbabilityStore()
		const enumerator = new RegionEnumerator(probabilities)
		const exactSafe = '0-0'
		const unresolved = ['1-0', '2-0']
		const vars = [exactSafe, ...unresolved]
		const constraint: Constraint = {
			cell: Cell.createCell({ position: { row: 1, col: 1 } }).toData(),
			neighbors: vars,
			mines: 1,
		}
		probabilities.setExact(exactSafe, 0, { row: 0, col: 0 })

		expect(enumerator.evaluateSubregion(vars, [constraint])).toBe(true)
		for (const key of unresolved) {
			expect(probabilities.get(key)?.value).toBe(0.5)
		}
	})

	it('subtracts exact mines before enumeration', () => {
		const probabilities = new ProbabilityStore()
		const enumerator = new RegionEnumerator(probabilities)
		const exactMine = '0-0'
		const unresolved = ['1-0', '2-0']
		const vars = [exactMine, ...unresolved]
		const constraint: Constraint = {
			cell: Cell.createCell({ position: { row: 1, col: 1 } }).toData(),
			neighbors: vars,
			mines: 1,
		}
		probabilities.setExact(exactMine, 1, { row: 0, col: 0 })

		expect(enumerator.evaluateSubregion(vars, [constraint])).toBe(true)
		for (const key of unresolved) {
			expect(probabilities.get(key)?.value).toBe(0)
		}
	})
})
