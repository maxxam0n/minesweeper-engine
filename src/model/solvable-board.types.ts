import type { CreateFieldAnalyzer } from './analyzer.types'
import type { FieldGrid } from './cell.types'
import type { FieldGeometry } from './geometry.types'
import type { GameParams, Position } from './primitives.types'

/**
 * Прогресс генерации решаемого поля (для UI / Worker).
 */
export type SolvableGenerationProgress = {
	attempt: number
	maxAttempts: number
	phase: 'sample' | 'simulate'
}

/**
 * Конфиг генерации решаемого поля. Geometry обязательна.
 */
export type SolvableBoardGenerateConfig = {
	params: GameParams
	geometry: FieldGeometry
	/**
	 * Стартовая клетка: генератор исключает её и соседей из мин (zero opening)
	 * и проверяет решаемость именно с этого хода. Первый клик в движке — `startPos`.
	 */
	startPos: Position
	rng?: () => number
	/** Максимум попыток сэмплинга (по умолчанию 500) */
	maxAttempts?: number
	onProgress?: (progress: SolvableGenerationProgress) => void
	/** Фабрика анализатора для проверки решаемости; по умолчанию встроенный Solver */
	createAnalyzer?: CreateFieldAnalyzer
}

/**
 * Успешный результат генерации: раскладка ещё не открыта, готова к `data` движка.
 */
export type SolvableBoardResult = {
	data: FieldGrid
	startPos: Position
	attempts: number
	params: GameParams
}
