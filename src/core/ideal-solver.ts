import type { BaseField } from '../model/base-field'
import { FieldFactory } from '../model/field-factory'
import type { SimpleCell } from '../model/simple-cell'
import type { FactoryConfig } from '../model/types'

/**
 * Metrics for ideal solve analysis.
 */
export interface IdealSolveMetrics {
	/**
	 * Estimated minimum number of left clicks required to solve the field,
	 * accounting for chord (middle-click) opportunities.
	 */
	total: number
	/**
	 * Estimated minimum number of left clicks required to solve the REMAINING field
	 * from the current state, accounting for chord opportunities.
	 */
	remaining: number
}

/**
 * Configuration options for ideal solver behavior.
 */
export interface IdealSolverOptions {
	/**
	 * If true, flag placement counts as separate clicks (right clicks).
	 */
	countFlags?: boolean
	/**
	 * If true, chord is only possible when all adjacent mines around a revealed cell
	 * are flagged (perfect flag placement).
	 *
	 * Only meaningful when countFlags=true.
	 */
	requireFlagsForChord?: boolean
	/**
	 * Maximum number of simulation steps to prevent excessive computation.
	 */
	maxSteps?: number
	/**
	 * For very large fields, simulation can be expensive. This threshold triggers
	 * a fast fallback estimation method.
	 */
	largeFieldFallbackThreshold?: number
}

/**
 * Ideal (reference) solver for calculating solving efficiency metrics.
 *
 * Important: This is not a "playing bot". It estimates the minimum required number
 * of left clicks based on complete field knowledge (mines are already known in `data`).
 */
export class IdealSolver {
	private field: BaseField<SimpleCell>
	private options: Required<IdealSolverOptions>

	/**
	 * Creates a new ideal solver instance.
	 * @param config - Field configuration including parameters, type, and cell data
	 * @param options - Optional solver behavior configuration
	 */
	constructor(config: FactoryConfig, options?: IdealSolverOptions) {
		this.field = FieldFactory.create(config)
		this.options = {
			countFlags: options?.countFlags ?? false,
			requireFlagsForChord: options?.requireFlagsForChord ?? false,
			maxSteps: options?.maxSteps ?? 50_000,
			largeFieldFallbackThreshold: options?.largeFieldFallbackThreshold ?? 2_000,
		}
	}

	/**
	 * Calculates ideal solve metrics for the current field state.
	 * @returns IdealSolveMetrics containing total and remaining click estimates
	 */
	public getMetrics(): IdealSolveMetrics {
		const remaining = this.calculateRemainingWithChords()
		// total "из текущего состояния" = remaining; полный total обычно фиксируется
		// снаружи (например, как userClicksAtStart + remainingAtStart).
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
		const allCells = this.field.grid.flat()

		// Быстрый фоллбек для очень больших полей
		if (allCells.length >= this.options.largeFieldFallbackThreshold) {
			return this.estimateRemainingWithoutChords3BV()
		}

		const byKey = new Map<string, SimpleCell>()
		for (const c of allCells) byKey.set(c.key, c)

		// Кэш областей раскрытия для клика по клетке (fixed по разметке мин)
		const areaCache = new Map<string, string[]>()
		const getAreaKeys = (cell: SimpleCell): string[] => {
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

		while (remainingSafe > 0) {
			if (clicks >= this.options.maxSteps) {
				// На всякий случай не зависаем: возвращаем более грубую оценку.
				return clicks + this.estimateRemainingWithoutChords3BV()
			}

			let bestNew = 0
			let bestKeys: string[] | null = null
			let bestCost = 1
			let bestFlagsToSet: string[] | null = null

			// 1) Лучший аккорд из текущих открытых клеток
			for (const cell of allCells) {
				if (cell.isMine || !cell.isRevealed) continue

				const neighbors = this.field.getSiblings(cell.position)
				const unopenedSafeNeighbors = neighbors.filter(n => !n.isMine && !n.isRevealed)
				if (unopenedSafeNeighbors.length === 0) continue

				let flagsToSet: string[] = []
				let chordCost = 1

				if (this.options.countFlags && this.options.requireFlagsForChord) {
					const mineNeighbors = neighbors.filter(n => n.isMine)
					flagsToSet = mineNeighbors.filter(m => !m.isFlagged).map(m => m.key)
					chordCost = 1 + flagsToSet.length
				}

				const union = new Set<string>()
				for (const n of unopenedSafeNeighbors) {
					for (const k of getAreaKeys(n)) union.add(k)
				}

				let newly = 0
				for (const k of union) {
					const target = byKey.get(k)
					if (target && !target.isMine && !target.isRevealed) newly++
				}

				const score = newly / chordCost
				const bestScore = bestNew / bestCost

				if (
					score > bestScore ||
					(score === bestScore && (newly > bestNew || (newly === bestNew && chordCost < bestCost)))
				) {
					bestNew = newly
					bestCost = chordCost
					bestKeys = Array.from(union)
					bestFlagsToSet = flagsToSet.length ? flagsToSet : null
				}
			}

			// 2) Лучший обычный клик по закрытой безопасной клетке
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

				if (
					score > bestScore ||
					(score === bestScore && (newly > bestNew || (newly === bestNew && cost < bestCost)))
				) {
					bestNew = newly
					bestCost = cost
					bestKeys = keys
					bestFlagsToSet = null
				}
			}

			// safety fallback (на случай если что-то пошло не так)
			if (!bestKeys || bestNew === 0) {
				const any = allCells.find(c => !c.isMine && !c.isRevealed)
				if (!any) break
				bestKeys = [any.key]
				bestCost = 1
				bestFlagsToSet = null
			}

			// Если выбран аккорд в режиме с флагами — сначала ставим флаги
			if (this.options.countFlags && bestFlagsToSet?.length) {
				for (const mineKey of bestFlagsToSet) {
					const mine = byKey.get(mineKey)
					if (mine && mine.isMine && !mine.isFlagged) mine.isFlagged = true
				}
			}

			// Применяем выбранное действие: раскрываем все клетки из bestKeys
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
		const allCells = this.field.grid.flat()

		const visitedZero = new Set<string>()
		let zeroComponentsRemaining = 0

		for (const cell of allCells) {
			if (cell.isMine || !cell.isEmpty) continue
			if (visitedZero.has(cell.key)) continue

			let componentHasUnrevealed = false
			const queue: SimpleCell[] = [cell]
			visitedZero.add(cell.key)

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
