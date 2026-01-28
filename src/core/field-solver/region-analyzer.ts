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
	 * Groups revealed cells into connected regions.
	 * Two revealed cells are in the same region if they share closed neighbors
	 * (i.e., their constraints overlap). This allows solving constraint systems
	 * independently for each region.
	 */
	public createConnectedRegions(cells: CellData[]): CellData[][] {
		const visited = new Set<string>()
		const regions: CellData[][] = []

		for (const cell of cells) {
			const key = createKey(cell.position)
			if (visited.has(key)) continue

			// Only include cells that have closed neighbors (they create constraints)
			const siblings = this.field.getSiblings(cell.position)
			const hasClosed = siblings.some(s => !s.isRevealed)

			if (!hasClosed) continue

			// BFS to find all connected revealed cells in this region
			const group: CellData[] = []
			const queue: CellData[] = [cell]

			while (queue.length > 0) {
				const current = queue.pop()!
				const currentKey = createKey(current.position)
				if (visited.has(currentKey)) continue

				visited.add(currentKey)
				group.push(current)

				// Find neighboring revealed cells that also have closed neighbors
				const neighbors = this.field
					.getSiblings(current.position)
					.filter(n => n.isRevealed && !visited.has(createKey(n.position)))

				for (const neighbor of neighbors) {
					const nSiblings = this.field.getSiblings(neighbor.position)
					const nHasClosed = nSiblings.some(s => !s.isRevealed)
					if (nHasClosed) {
						queue.push(neighbor)
					}
				}
			}

			if (group.length > 0) {
				regions.push(group)
			}
		}

		return regions
	}

	/**
	 * Builds a constraint system from a region of revealed cells.
	 * Each revealed number cell creates a constraint: exactly N of its closed neighbors are mines.
	 * Returns the set of all variables (closed cells) and constraints (mine count equations).
	 */
	public buildConstraints(region: CellData[]): RegionAnalysis {
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
