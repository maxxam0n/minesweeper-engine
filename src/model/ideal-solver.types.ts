export interface IdealSolveMetrics {
	total: number
	remaining: number
}

export interface IdealSolverOptions {
	countFlags?: boolean
	requireFlagsForChord?: boolean
	maxSteps?: number
	largeFieldFallbackThreshold?: number
}
