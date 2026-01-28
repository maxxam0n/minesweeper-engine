import { Field } from '../model/Field'
import { GeometryFactory } from '../model/geometry/Factory'
import type { Cell } from '../model/Cell'
import type { MineSweeperConfig } from '../model/types'
import type {
	IdealSolveMetrics,
	IdealSolverOptions,
} from '../model/ideal-solver.types'

/**
 * Ideal (reference) solver for calculating solving efficiency metrics.
 *
 * Important: This is not a "playing bot". It estimates the minimum required number
 * of left clicks based on complete field knowledge (mines are already known in `data`).
 */
export class IdealSolver {
	private field: Field
	private options: Required<IdealSolverOptions>

	/**
	 * Creates a new ideal solver instance.
	 * @param config - Field configuration including parameters, type, and cell data
	 * @param options - Optional solver behavior configuration
	 */
	constructor(
		config: MineSweeperConfig | Field,
		options?: IdealSolverOptions,
	) {
		if (config instanceof Field) {
			this.field = config.cloneSelf()
		} else {
			const geometry = config.geometry || GeometryFactory.create(config)
			this.field = new Field({ ...config, geometry })
		}
		this.options = {
			countFlags: options?.countFlags ?? false,
			requireFlagsForChord: options?.requireFlagsForChord ?? false,
			maxSteps: options?.maxSteps ?? 50_000,
			largeFieldFallbackThreshold:
				options?.largeFieldFallbackThreshold ?? 2_000,
		}
	}

	/**
	 * Calculates ideal solve metrics for the current field state.
	 * @returns IdealSolveMetrics containing total and remaining click estimates
	 */
	public getMetrics(): IdealSolveMetrics {
		const remaining = this.calculateRemainingWithChords()
		return { total: remaining, remaining }
	}

	/**
	 * Estimates minimum clicks through simulation of "ideal" revelation.
	 *
	 * Action model (all counted as 1 left click):
	 * - click: click on closed safe cell -> reveals `getAreaToReveal`
	 * - chord: click on already revealed cell -> reveals all its adjacent closed safe cells
	 *          (and their areas via `getAreaToReveal`), as in the engine's chord behavior.
	 *
	 * Important: flags are not counted as separate clicks here (assumes ideal mine marking).
	 */
	private calculateRemainingWithChords(): number {
		const allCells = this.field.grid
			.flat()
			.filter((cell): cell is Cell => cell !== null)

		// Fast fallback for very large fields to avoid performance issues
		if (allCells.length >= this.options.largeFieldFallbackThreshold) {
			return this.estimateRemainingWithoutChords3BV()
		}

		const byKey = new Map<string, Cell>()
		for (const c of allCells) byKey.set(c.key, c)

		// Cache of reveal areas for each cell click (fixed based on mine layout)
		// This avoids recalculating getAreaToReveal for the same cell multiple times
		const areaCache = new Map<string, string[]>()
		const getAreaKeys = (cell: Cell): string[] => {
			const cached = areaCache.get(cell.key)
			if (cached) return cached
			const area = this.field.getAreaToReveal(cell.position)
			const keys = area.filter(a => !a.isMine).map(a => a.key)
			areaCache.set(cell.key, keys)
			return keys
		}

		let remainingSafe = 0
		for (const c of allCells) if (!c.isMine && !c.isRevealed) remainingSafe++
		if (remainingSafe === 0) return 0

		let clicks = 0

		// Greedy algorithm: at each step, choose the action (chord or click) that reveals
		// the most new safe cells per click cost, maximizing efficiency
		while (remainingSafe > 0) {
			if (clicks >= this.options.maxSteps) {
				// Safety fallback to prevent infinite loops: return a coarser estimate
				return clicks + this.estimateRemainingWithoutChords3BV()
			}

			let bestNew = 0
			let bestKeys: string[] | null = null
			let bestCost = 1
			let bestFlagsToSet: string[] | null = null

			// 1) Find the best chord from currently revealed cells
			// A chord is clicking on a revealed cell to reveal all adjacent safe cells
			// We evaluate all possible chords and pick the one with best efficiency (new cells / cost)
			for (const cell of allCells) {
				if (cell.isMine || !cell.isRevealed) continue

				const neighbors = this.field.getSiblings(cell.position)
				const unopenedSafeNeighbors = neighbors.filter(
					n => !n.isMine && !n.isRevealed,
				)
				if (unopenedSafeNeighbors.length === 0) continue

				let flagsToSet: string[] = []
				let chordCost = 1

				// In flag-counting mode, we may need to set flags before chording
				if (this.options.countFlags && this.options.requireFlagsForChord) {
					const mineNeighbors = neighbors.filter(n => n.isMine)
					flagsToSet = mineNeighbors
						.filter(m => !m.isFlagged)
						.map(m => m.key)
					chordCost = 1 + flagsToSet.length
				}

				// Calculate union of all areas that would be revealed by this chord
				const union = new Set<string>()
				for (const n of unopenedSafeNeighbors) {
					for (const k of getAreaKeys(n)) union.add(k)
				}

				// Count how many new safe cells would be revealed
				let newly = 0
				for (const k of union) {
					const target = byKey.get(k)
					if (target && !target.isMine && !target.isRevealed) newly++
				}

				// Score is efficiency: new cells per cost
				const score = newly / chordCost
				const bestScore = bestNew / bestCost

				// Update best if this chord is more efficient, or equally efficient but reveals more
				if (
					score > bestScore ||
					(score === bestScore &&
						(newly > bestNew ||
							(newly === bestNew && chordCost < bestCost)))
				) {
					bestNew = newly
					bestCost = chordCost
					bestKeys = Array.from(union)
					bestFlagsToSet = flagsToSet.length ? flagsToSet : null
				}
			}

			// 2) Find the best regular click on a closed safe cell
			// This evaluates direct clicks that reveal areas of cells
			// Compare with chords to find the globally optimal action
			for (const cell of allCells) {
				if (cell.isMine || cell.isRevealed) continue

				const keys = getAreaKeys(cell)
				let newly = 0
				for (const k of keys) {
					const target = byKey.get(k)
					if (target && !target.isMine && !target.isRevealed) newly++
				}

				const cost = 1
				const score = newly / cost
				const bestScore = bestNew / bestCost

				// Update best if this click is more efficient
				if (
					score > bestScore ||
					(score === bestScore &&
						(newly > bestNew || (newly === bestNew && cost < bestCost)))
				) {
					bestNew = newly
					bestCost = cost
					bestKeys = keys
					bestFlagsToSet = null
				}
			}

			// Safety fallback: if no valid action found, pick any unrevealed safe cell
			if (!bestKeys || bestNew === 0) {
				const any = allCells.find(c => !c.isMine && !c.isRevealed)
				if (!any) break
				bestKeys = [any.key]
				bestCost = 1
				bestFlagsToSet = null
			}

			// If a chord was selected in flag-counting mode, set flags first
			if (this.options.countFlags && bestFlagsToSet?.length) {
				for (const mineKey of bestFlagsToSet) {
					const mine = byKey.get(mineKey)
					if (mine && mine.isMine && !mine.isFlagged) mine.isFlagged = true
				}
			}

			// Apply the selected action: reveal all cells from bestKeys
			for (const k of bestKeys) {
				const target = byKey.get(k)
				if (!target || target.isMine || target.isRevealed) continue
				target.isRevealed = true
				remainingSafe--
			}

			clicks += bestCost
		}

		return clicks
	}

	/**
	 * Fast estimation of remaining clicks without accounting for chords (analogous to 3BV-remaining).
	 * Used as a fallback for large fields or iteration limits.
	 */
	private estimateRemainingWithoutChords3BV(): number {
		const allCells = this.field.grid
			.flat()
			.filter((cell): cell is Cell => cell !== null)

		// Count connected components of empty (zero) cells that haven't been revealed
		// Each unrevealed zero component requires at least one click
		const visitedZero = new Set<string>()
		let zeroComponentsRemaining = 0

		for (const cell of allCells) {
			if (cell.isMine || !cell.isEmpty) continue
			if (visitedZero.has(cell.key)) continue

			let componentHasUnrevealed = false
			const queue: Cell[] = [cell]
			visitedZero.add(cell.key)

			// BFS to find all connected zero cells in this component
			while (queue.length) {
				const cur = queue.pop()!
				if (!cur.isRevealed) componentHasUnrevealed = true

				const zeroNeighbors = this.field
					.getSiblings(cur.position)
					.filter(n => !n.isMine && n.isEmpty)

				for (const nb of zeroNeighbors) {
					if (visitedZero.has(nb.key)) continue
					visitedZero.add(nb.key)
					queue.push(nb)
				}
			}

			if (componentHasUnrevealed) zeroComponentsRemaining++
		}

		// Count isolated number cells (not adjacent to any zero cell)
		// These require individual clicks as they can't be revealed via zero-area expansion
		let isolatedNumbersRemaining = 0
		for (const cell of allCells) {
			if (cell.isMine) continue
			if (cell.isEmpty) continue
			if (cell.isRevealed) continue

			const hasZeroNeighbor = this.field
				.getSiblings(cell.position)
				.some(n => !n.isMine && n.isEmpty)

			if (!hasZeroNeighbor) isolatedNumbersRemaining++
		}

		return zeroComponentsRemaining + isolatedNumbersRemaining
	}
}
