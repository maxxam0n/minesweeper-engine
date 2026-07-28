import { Field } from '../model/Field'
import type { Cell } from '../model/Cell'
import type { MineSweeperConfig } from '../model/types'
import type { IdealSolveMetrics } from '../model/ideal-solver.types'

/**
 * Классический калькулятор 3BV (Bechtel's Board Benchmark Value).
 *
 * Это не «играющий бот»: считает минимум левых кликов без chord
 * при полной известности мин в `data` (после первого reveal или из готовой раскладки).
 *
 * Efficiency: `metrics.total / playerClicks` (IOE) или ×100% для процентов.
 */
export class IdealSolver {
	private field: Field

	/**
	 * @param config - Конфиг поля или уже собранный `Field` с известными минами
	 */
	constructor(config: MineSweeperConfig | Field) {
		if (config instanceof Field) {
			this.field = config.cloneSelf()
		} else {
			this.field = new Field(config)
		}
	}

	/**
	 * Считает классический 3BV.
	 * - `remaining` — 3BV-remaining от текущего прогресса
	 * - `total` — 3BV с чистого поля (все safe-клетки закрыты)
	 */
	public getMetrics(): IdealSolveMetrics {
		const remaining = IdealSolver.calculateThreeBV(this.field)

		const totalField = this.field.cloneSelf()
		IdealSolver.resetProgress(totalField)
		const total = IdealSolver.calculateThreeBV(totalField)

		return { total, remaining }
	}

	/**
	 * Классический Index of Efficiency: `3BV / clicks`.
	 * Значения > 1 достижимы за счёт chord.
	 */
	public static efficiency(threeBV: number, clicks: number): number {
		if (clicks <= 0) return 0
		return threeBV / clicks
	}

	private static resetProgress(field: Field): void {
		for (const cell of field.grid.flat()) {
			if (!cell) continue
			cell.isRevealed = false
			cell.isFlagged = false
		}
	}

	/**
	 * Точный 3BV / 3BV-remaining по определению Bechtel:
	 * openings с хотя бы одной нераскрытой пустой клеткой +
	 * нераскрытые цифры без соседнего opening.
	 */
	private static calculateThreeBV(field: Field): number {
		const allCells = field.grid
			.flat()
			.filter((cell): cell is Cell => cell !== null)

		const visitedZero = new Set<string>()
		let openingsRemaining = 0

		for (const cell of allCells) {
			if (cell.isMine || !cell.isEmpty) continue
			if (visitedZero.has(cell.key)) continue

			let componentHasUnrevealed = false
			const queue: Cell[] = [cell]
			visitedZero.add(cell.key)

			while (queue.length) {
				const cur = queue.pop()!
				if (!cur.isRevealed) componentHasUnrevealed = true

				for (const neighbor of field.getSiblings(cur.position)) {
					if (neighbor.isMine || !neighbor.isEmpty) continue
					if (visitedZero.has(neighbor.key)) continue
					visitedZero.add(neighbor.key)
					queue.push(neighbor)
				}
			}

			if (componentHasUnrevealed) openingsRemaining++
		}

		let isolatedNumbersRemaining = 0
		for (const cell of allCells) {
			if (cell.isMine || cell.isEmpty || cell.isRevealed) continue

			const touchesOpening = field
				.getSiblings(cell.position)
				.some(neighbor => !neighbor.isMine && neighbor.isEmpty)

			if (!touchesOpening) isolatedNumbersRemaining++
		}

		return openingsRemaining + isolatedNumbersRemaining
	}
}
