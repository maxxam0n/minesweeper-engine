/**
 * Классические метрики 3BV (Bechtel's Board Benchmark Value).
 *
 * 3BV — минимум левых кликов без chord и без учёта флагов:
 * - 1 клик на каждое opening (связная компонента пустых клеток);
 * - 1 клик на каждую нераскрытую цифру, не граничащую с opening.
 *
 * Efficiency / IOE в сообществе: `3BV / clicks` (часто ×100%).
 * Значения > 1 (или > 100%) достижимы только через chord.
 */
export interface IdealSolveMetrics {
	/** 3BV с чистого поля (все safe-клетки закрыты) */
	total: number
	/** 3BV-remaining от текущего прогресса до конца */
	remaining: number
}
