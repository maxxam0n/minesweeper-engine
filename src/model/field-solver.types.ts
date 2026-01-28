import type { CellData, FieldState, MineSweeperConfig, Position } from './types'

export type Constraint = {
	cell: CellData
	neighbors: string[]
	mines: number
}

export type Subset = {
	key: string
	positions: Set<string>
	mineCount: number
}

export interface RegionConstraint {
	indices: number[]
	mines: number
}

export type Subregion = {
	vars: string[]
	cons: Constraint[]
}

export type RegionAnalysis = {
	variables: string[]
	constraints: Constraint[]
}

export interface FieldView {
	getFieldSnapshot(): FieldState
	getSiblings(position: Position): CellData[]
}

export type SolverConfig = FieldView | MineSweeperConfig
