import { createKey } from '../../lib/utils'
import type { CellData } from '../../model/types'
import type {
	Constraint,
	FieldView,
	RegionAnalysis,
	Subregion,
} from '../../model/field-solver.types'

export class RegionAnalyzer {
	constructor(private readonly field: FieldView) {}

	/**
	 * Группирует открытые клетки по общим закрытым соседям.
	 * Ограничения без общих переменных можно решать независимо.
	 */
	public createConnectedRegions(cells: readonly CellData[]): CellData[][] {
		const entries = cells
			.map(cell => ({
				cell,
				variables: this.field
					.getSiblings(cell.position)
					.filter(sibling => !sibling.isRevealed)
					.map(sibling => createKey(sibling.position)),
			}))
			.filter(entry => entry.variables.length > 0)
		const constraintsByVariable = new Map<string, number[]>()

		for (let index = 0; index < entries.length; index++) {
			for (const variable of entries[index].variables) {
				const constraintIndexes = constraintsByVariable.get(variable) ?? []
				constraintIndexes.push(index)
				constraintsByVariable.set(variable, constraintIndexes)
			}
		}

		const visited = new Array<boolean>(entries.length).fill(false)
		const regions: CellData[][] = []

		for (let startIndex = 0; startIndex < entries.length; startIndex++) {
			if (visited[startIndex]) continue

			const region: CellData[] = []
			const queue = [startIndex]
			const expandedVariables = new Set<string>()
			visited[startIndex] = true
			while (queue.length > 0) {
				const currentIndex = queue.pop()!
				const current = entries[currentIndex]
				region.push(current.cell)

				for (const variable of current.variables) {
					if (expandedVariables.has(variable)) continue
					expandedVariables.add(variable)

					for (const neighborIndex of constraintsByVariable.get(variable) ?? []) {
						if (!visited[neighborIndex]) {
							visited[neighborIndex] = true
							queue.push(neighborIndex)
						}
					}
				}
			}

			regions.push(region)
		}

		return regions
	}

	/**
	 * Builds a constraint system from a region of revealed cells.
	 * Each revealed number cell creates a constraint: exactly N of its closed neighbors are mines.
	 * Returns the set of all variables (closed cells) and constraints (mine count equations).
	 */
	public buildConstraints(region: readonly CellData[]): RegionAnalysis {
		const constraints: Constraint[] = []
		const variables = new Set<string>()

		for (const cell of region) {
			const siblings = this.field.getSiblings(cell.position)
			const closedSiblings = siblings.filter(s => !s.isRevealed)

			// Each closed neighbor is a variable (could be mine or safe)
			const variableKeys = closedSiblings.map(s => createKey(s.position))
			variableKeys.forEach(key => variables.add(key))

			// Create constraint: exactly cell.adjacentMines of these variables are mines
			constraints.push({
				cell,
				neighbors: variableKeys,
				mines: cell.adjacentMines,
			})
		}

		return { variables: Array.from(variables), constraints }
	}

	/**
	 * Splits a constraint system into independent subregions (connected components).
	 * Two variables are connected if they appear together in at least one constraint.
	 * This allows solving smaller subproblems independently, reducing computational complexity.
	 */
	public splitIntoSubregions(
		variableList: string[],
		constraints: Constraint[],
	): Subregion[] {
		if (variableList.length === 0) return []

		// Build adjacency graph: variables are connected if they share a constraint
		const indexOf = new Map<string, number>()
		variableList.forEach((v, i) => indexOf.set(v, i))

		const adj: number[][] = variableList.map(() => [])
		for (const c of constraints) {
			const indices = c.neighbors.map(v => indexOf.get(v)!)
			// Connect all pairs of variables in the same constraint
			for (let i = 0; i < indices.length; i++) {
				for (let j = i + 1; j < indices.length; j++) {
					const a = indices[i]
					const b = indices[j]
					adj[a].push(b)
					adj[b].push(a)
				}
			}
		}

		// Find connected components using DFS
		const visited = new Array<boolean>(variableList.length).fill(false)
		const components: Subregion[] = []

		for (let i = 0; i < variableList.length; i++) {
			if (visited[i]) continue
			const stack = [i]
			const compIdx: number[] = []
			visited[i] = true
			while (stack.length) {
				const v = stack.pop()!
				compIdx.push(v)
				for (const neigh of adj[v]) {
					if (!visited[neigh]) {
						visited[neigh] = true
						stack.push(neigh)
					}
				}
			}

			// Extract variables and constraints for this component
			const vars = compIdx.map(idx => variableList[idx])
			const varSet = new Set(vars)
			const cons = constraints.filter(c =>
				c.neighbors.some(n => varSet.has(n)),
			)
			components.push({ vars, cons })
		}

		return components
	}
}
