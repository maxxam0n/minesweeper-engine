import { createKey, difference, isSubset, parseKey } from '../../lib/utils'
import type { CellData } from '../../model/types'
import type { FieldView, Subset } from '../../model/field-solver.types'
import { reduceCellConstraint } from './constraint-reducer'
import { ProbabilityStore } from './probability-store'

export class DirectInference {
	constructor(
		private readonly field: FieldView,
		private readonly probabilities: ProbabilityStore,
	) {}

	/**
	 * Infers certain mines: if a number cell has exactly N mines and N closed neighbors
	 * (after accounting for known safe cells), all closed neighbors must be mines.
	 */
	public inferCertainMines(cells: readonly CellData[]): boolean {
		let updated = false

		for (const cell of cells) {
			if (cell.isEmpty || cell.isMine) continue

			const siblings = this.field.getSiblings(cell.position)
			const closed = siblings.filter(s => !s.isRevealed)
			const { unresolvedCells, minesLeft } = reduceCellConstraint(
				closed,
				cell.adjacentMines,
				this.probabilities,
			)

			if (
				unresolvedCells.length === 0 ||
				minesLeft !== unresolvedCells.length
			) {
				continue
			}

			for (const sibling of unresolvedCells) {
				const key = createKey(sibling.position)
				if (this.probabilities.setExact(key, 1, sibling.position)) {
					updated = true
				}
			}
		}

		return updated
	}

	/**
	 * Infers certain safe cells: if a number cell already has all its required mines
	 * identified among closed neighbors (via solver probabilities, not player flags),
	 * all remaining closed neighbors are safe.
	 */
	public inferCertainSafeCells(cells: readonly CellData[]): boolean {
		let updated = false

		for (const cell of cells) {
			if (cell.isEmpty || cell.isMine) continue

			const siblings = this.field.getSiblings(cell.position)
			const closed = siblings.filter(s => !s.isRevealed)
			const { unresolvedCells, minesLeft } = reduceCellConstraint(
				closed,
				cell.adjacentMines,
				this.probabilities,
			)

			if (unresolvedCells.length === 0 || minesLeft !== 0) continue

			for (const sibling of unresolvedCells) {
				const key = createKey(sibling.position)
				if (this.probabilities.setExact(key, 0, sibling.position)) {
					updated = true
				}
			}
		}

		return updated
	}

	/**
	 * Infers by subset difference: compares pairs of constraints where one is a subset of another.
	 *
	 * If constraint A (subset) requires N mines and constraint B (superset) requires M mines,
	 * and A is fully contained in B, then the difference set (B - A) must contain exactly (M - N) mines.
	 *
	 * Special cases:
	 * - If M - N = 0: all cells in difference are safe
	 * - If M - N = |difference|: all cells in difference are mines
	 */
	public inferBySubsetDifference(cells: readonly CellData[]): boolean {
		let updated = false

		const subsets: Subset[] = []

		// Build constraint subsets: for each revealed number cell, create a constraint
		// representing the unknown closed neighbors and remaining mine count
		for (const cell of cells) {
			if (cell.isEmpty || cell.isMine) continue

			const siblings = this.field.getSiblings(cell.position)
			const closedSiblings = siblings.filter(sib => !sib.isRevealed)
			const { unresolvedCells, minesLeft } = reduceCellConstraint(
				closedSiblings,
				cell.adjacentMines,
				this.probabilities,
			)

			if (
				unresolvedCells.length === 0 ||
				minesLeft < 0 ||
				minesLeft > unresolvedCells.length
			) {
				continue
			}

			subsets.push({
				key: createKey(cell.position),
				positions: new Set(
					unresolvedCells.map(sibling => createKey(sibling.position)),
				),
				mineCount: minesLeft,
			})
		}

		// Compare all pairs of constraints to find subset relationships
		for (let i = 0; i < subsets.length; i++) {
			for (let j = i + 1; j < subsets.length; j++) {
				const a = subsets[i]
				const b = subsets[j]

				const intersection = new Set(
					[...a.positions].filter(p => b.positions.has(p)),
				)
				if (intersection.size === 0) continue

				// Case 1: A is a subset of B
				if (isSubset(a.positions, b.positions)) {
					const diff = difference(b.positions, a.positions)
					const diffMineCount = b.mineCount - a.mineCount

					// If difference requires 0 mines, all are safe
					if (diffMineCount === 0) {
						diff.forEach(pos => {
							if (
								this.probabilities.setExact(
									pos,
									0,
									parseKey(pos),
								)
							) {
								updated = true
							}
						})
					} else if (diffMineCount === diff.size) {
						// If difference requires all to be mines, all are mines
						diff.forEach(pos => {
							if (
								this.probabilities.setExact(
									pos,
									1,
									parseKey(pos),
								)
							) {
								updated = true
							}
						})
					}
				} else if (isSubset(b.positions, a.positions)) {
					// Case 2: B is a subset of A (symmetric case)
					const diff = difference(a.positions, b.positions)
					const diffMineCount = a.mineCount - b.mineCount

					if (diffMineCount === 0) {
						diff.forEach(pos => {
							if (
								this.probabilities.setExact(
									pos,
									0,
									parseKey(pos),
								)
							) {
								updated = true
							}
						})
					} else if (diffMineCount === diff.size) {
						diff.forEach(pos => {
							if (
								this.probabilities.setExact(
									pos,
									1,
									parseKey(pos),
								)
							) {
								updated = true
							}
						})
					}
				}
			}
		}

		return updated
	}

	/**
	 * Computes probability estimates for cells that couldn't be determined with certainty.
	 * For each number cell, calculates the ratio of remaining mines to unknown neighbors,
	 * and assigns this probability to all unknown neighbors that don't already have a probability.
	 *
	 * This provides a heuristic estimate when exact inference isn't possible.
	 */
	public inferByLocalRatios(cells: readonly CellData[]): void {
		for (const cell of cells) {
			if (cell.isEmpty || cell.isMine) continue

			const siblings = this.field.getSiblings(cell.position)
			const closed = siblings.filter(s => !s.isRevealed)
			const { unresolvedCells, minesLeft } = reduceCellConstraint(
				closed,
				cell.adjacentMines,
				this.probabilities,
			)

			if (
				unresolvedCells.length === 0 ||
				minesLeft < 0 ||
				minesLeft > unresolvedCells.length
			) {
				continue
			}

			const probability = minesLeft / unresolvedCells.length

			// Более точную ранее рассчитанную вероятность не заменяем.
			for (const sibling of unresolvedCells) {
				const key = createKey(sibling.position)
				if (this.probabilities.has(key)) continue
				this.probabilities.setProbability(key, probability)
			}
		}
	}
}
