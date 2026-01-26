import type { BaseField } from '../model/base-field'
import { FieldFactory } from '../model/field-factory'
import type { SimpleCell } from '../model/simple-cell'
import type { FactoryConfig } from '../model/types'

export interface IdealSolveMetrics {
	/**
	 * Оценка минимального количества левых кликов для решения поля,
	 * учитывая возможность аккордов (chord).
	 */
	total: number
	/**
	 * Оценка минимального количества левых кликов для решения ОСТАВШЕГОСЯ поля
	 * из текущего состояния, учитывая возможность аккордов.
	 */
	remaining: number
}

export interface IdealSolverOptions {
	/**
	 * Если true — учитываем постановку флагов как отдельные клики (right click).
	 */
	countFlags?: boolean
	/**
	 * Если true — аккорд возможен только когда вокруг открытой клетки
	 * проставлены флаги на всех соседних минах (идеально корректные флаги).
	 *
	 * Имеет смысл только при countFlags=true.
	 */
	requireFlagsForChord?: boolean
	/**
	 * Защита от слишком долгой симуляции.
	 */
	maxSteps?: number
	/**
	 * При очень больших полях симуляция может быть дорогой — используем быстрый фоллбек.
	 */
	largeFieldFallbackThreshold?: number
}

/**
 * "Идеальный" (эталонный) анализатор для расчёта эффективности прохождения.
 *
 * Важно: это не "играющий бот". Он оценивает минимально необходимое число
 * левых кликов исходя из полной разметки поля (мины уже известны в `data`).
 */
export class IdealSolver {
	private field: BaseField<SimpleCell>
	private options: Required<IdealSolverOptions>

	constructor(config: FactoryConfig, options?: IdealSolverOptions) {
		this.field = FieldFactory.create(config)
		this.options = {
			countFlags: options?.countFlags ?? false,
			requireFlagsForChord: options?.requireFlagsForChord ?? false,
			maxSteps: options?.maxSteps ?? 50_000,
			largeFieldFallbackThreshold: options?.largeFieldFallbackThreshold ?? 2_000,
		}
	}

	public getMetrics(): IdealSolveMetrics {
		const remaining = this.calculateRemainingWithChords()
		// total "из текущего состояния" = remaining; полный total обычно фиксируется
		// снаружи (например, как userClicksAtStart + remainingAtStart).
		return { total: remaining, remaining }
	}

	/**
	 * Оценивает минимум кликов через симуляцию "идеального" раскрытия.
	 *
	 * Модель действий (все считаются как 1 левый клик):
	 * - click: клик по закрытой безопасной клетке -> раскрывает `getAreaToReveal`
	 * - chord: клик по уже открытой клетке -> раскрывает все её соседние закрытые безопасные клетки
	 *          (и их области через `getAreaToReveal`), как в движке при аккорде.
	 *
	 * Важно: флаги здесь не считаются отдельными кликами (предполагаем идеальную разметку мин).
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
	 * Быстрая оценка остатка без учёта аккордов (аналог 3BV-остатка).
	 * Используется как фоллбек для больших полей/лимита итераций.
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
