import { createKey } from '../../lib/utils'
import type { CellData } from '../../model/types'
import type {
	Constraint,
	RegionAnalysis,
} from '../../model/field-solver.types'
import type { ProbabilityStore } from './probability-store'

const getExactValue = (
	probabilities: ProbabilityStore,
	key: string,
): 0 | 1 | undefined => {
	const value = probabilities.get(key)?.value
	return value === 0 || value === 1 ? value : undefined
}

export const reduceCellConstraint = (
	closedCells: readonly CellData[],
	requiredMines: number,
	probabilities: ProbabilityStore,
) => {
	const unresolvedCells: CellData[] = []
	let minesLeft = requiredMines

	for (const cell of closedCells) {
		const exactValue = getExactValue(probabilities, createKey(cell.position))
		if (exactValue === 1) {
			minesLeft--
		} else if (exactValue === undefined) {
			unresolvedCells.push(cell)
		}
	}

	return { unresolvedCells, minesLeft }
}

export const reduceConstraintSystem = (
	variableList: readonly string[],
	constraints: readonly Constraint[],
	probabilities: ProbabilityStore,
): RegionAnalysis => {
	const variables = variableList.filter(
		key => getExactValue(probabilities, key) === undefined,
	)
	const reducedConstraints = constraints.map(constraint => {
		let mines = constraint.mines
		const neighbors = constraint.neighbors.filter(key => {
			const exactValue = getExactValue(probabilities, key)
			if (exactValue === 1) mines--
			return exactValue === undefined
		})

		return { ...constraint, neighbors, mines }
	})

	return { variables, constraints: reducedConstraints }
}
