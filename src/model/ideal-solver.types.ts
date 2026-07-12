export interface IdealSolveMetrics {
	/** Оценка кликов с чистого поля (все safe-клетки закрыты) */
	total: number
	/** Оценка кликов от текущего прогресса до конца */
	remaining: number
}

export interface IdealSolverOptions {
	countFlags?: boolean
	requireFlagsForChord?: boolean
	maxSteps?: number
	largeFieldFallbackThreshold?: number
}
