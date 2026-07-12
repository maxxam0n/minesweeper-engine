export { Solver as MinesweeperSolver } from './core/field-solver'
export { GameEngine as MinesweeperEngine } from './core/game-engine'
export { IdealSolver as MinesweeperIdealSolver } from './core/ideal-solver'
export { BoardEditor } from './model/board-editor'
export { Cell as FieldCell } from './model/Cell'
export { Field } from './model/Field'
export { GeometryFactory } from './model/geometry/Factory'
export {
	InvalidGameParamsError,
	isValidGameParams,
} from './lib/validate-params'
export type {
	CreateFieldAnalyzer,
	FieldAnalyzer,
} from './model/analyzer.types'
export type { BoardEditorConfig } from './model/board-editor.types'
export type { FieldView, SolverConfig } from './model/field-solver.types'
export type {
	IdealSolveMetrics,
	IdealSolverOptions,
} from './model/ideal-solver.types'
export * from './model/types'
