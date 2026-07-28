import type { CreateFieldAnalyzer } from './analyzer.types'
import type { FieldGrid } from './cell.types'
import type { FieldGeometry } from './geometry.types'
import type { GameParams, Position } from './primitives.types'

/**
 * Прогресс генерации решаемого поля (для UI / Worker).
 */
export type SolvableGenerationProgress = {
	readonly attempt: number
	readonly maxAttempts: number
	readonly phase: 'sample' | 'simulate'
}

/**
 * Конфиг генерации решаемого поля. Geometry обязательна.
 */
export type SolvableBoardGenerateConfig = {
	readonly params: GameParams
	readonly geometry: FieldGeometry
	/**
	 * Стартовая клетка: генератор исключает её и соседей из мин (zero opening)
	 * и проверяет решаемость именно с этого хода. Первый клик в движке — `startPos`.
	 */
	readonly startPos: Position
	/** Генератор случайных чисел, возвращающий конечное значение в диапазоне [0, 1). */
	readonly rng?: () => number
	/** Положительное безопасное целое число попыток сэмплинга (по умолчанию 500). */
	readonly maxAttempts?: number
	readonly onProgress?: (progress: SolvableGenerationProgress) => void
	/** Фабрика анализатора для проверки решаемости; по умолчанию встроенный Solver */
	readonly createAnalyzer?: CreateFieldAnalyzer
}

/**
 * Успешный результат генерации: раскладка ещё не открыта, готова к `data` движка.
 */
export type SolvableBoardResult = {
	readonly data: FieldGrid
	readonly startPos: Position
	readonly attempts: number
	readonly params: GameParams
}
