import type {
	Constraint,
	RegionConstraint,
} from '../../model/field-solver.types'
import { parseKey } from '../../lib/utils'
import { reduceConstraintSystem } from './constraint-reducer'
import { ProbabilityStore } from './probability-store'

const MAX_FULL_ENUM_VARS = 18
const MAX_LOOKAHEAD_VARS = 30
const MAX_LOOKAHEAD_SEARCH_NODES = 100_000

type EnumerationResult = { total: number; counts: number[] }
type SearchBudget = { remainingNodes: number }
type Satisfiability =
	| 'satisfiable'
	| 'unsatisfiable'
	| 'budget-exceeded'

export class RegionEnumerator {
	/** Кэши действуют только в рамках одного вызова solve(). */
	private readonly enumerationCache = new Map<string, EnumerationResult>()
	private readonly satisfiabilityCache = new Map<string, boolean>()
	private lookaheadNodesRemaining = MAX_LOOKAHEAD_SEARCH_NODES

	constructor(private readonly probabilities: ProbabilityStore) {}

	public clearCache(): void {
		this.enumerationCache.clear()
		this.satisfiabilityCache.clear()
		this.lookaheadNodesRemaining = MAX_LOOKAHEAD_SEARCH_NODES
	}

	/**
	 * Для малых регионов перечисляет все конфигурации, для средних выполняет
	 * ограниченный по числу узлов поиск решений, большие регионы пропускает.
	 */
	public evaluateSubregion(vars: string[], cons: Constraint[]): boolean {
		let updated = false
		const { variables, constraints } = reduceConstraintSystem(
			vars,
			cons,
			this.probabilities,
		)

		if (variables.length <= MAX_FULL_ENUM_VARS) {
			// Full enumeration: count how many valid configurations have each variable as mine
			const { counts, total } = this.enumerateRegion(
				variables,
				constraints,
			)
			if (total === 0) return false

			// Calculate probability for each variable: configurations with mine / total configurations
			for (let i = 0; i < variables.length; i++) {
				const key = variables[i]
				const probValue = counts[i] / total
				if (this.probabilities.setProbability(key, probValue)) {
					updated = true
				}
			}
		} else if (variables.length <= MAX_LOOKAHEAD_VARS) {
			if (this.processByLookAhead(variables, constraints)) {
				updated = true
			}
		}

		return updated
	}

	/**
	 * Enumerates all valid mine configurations for a constraint system.
	 * Uses canonical form (sorted variables/constraints) for caching to avoid
	 * re-enumerating isomorphic constraint systems.
	 */
	private enumerateRegion(
		variableList: string[],
		constraints: Constraint[],
	): { counts: number[]; total: number } {
		// Convert to canonical form (sorted) for cache lookup
		const canonicalVars = [...variableList].sort()
		const canonIndex = new Map<string, number>()
		canonicalVars.forEach((v, i) => canonIndex.set(v, i))

		const canonicalConstraints: RegionConstraint[] = constraints.map(c => ({
			indices: c.neighbors.map(n => canonIndex.get(n)!),
			mines: c.mines,
		}))

		const key = this.createConstraintsKey(
			canonicalVars.length,
			canonicalConstraints,
		)

		let cached = this.enumerationCache.get(key)
		if (!cached) {
			cached = this.bruteForce(canonicalVars.length, canonicalConstraints)
			this.enumerationCache.set(key, cached)
		}

		// Map canonical results back to original variable order
		const counts = new Array<number>(variableList.length).fill(0)
		for (let i = 0; i < variableList.length; i++) {
			const ci = canonIndex.get(variableList[i])!
			counts[i] = cached.counts[ci]
		}

		return { counts, total: cached.total }
	}

	private createConstraintsKey(
		varCount: number,
		constraints: RegionConstraint[],
	): string {
		const parts = constraints.map(rc => {
			const idx = [...rc.indices].sort((a, b) => a - b).join(',')
			return `${rc.mines}:${idx}`
		})
		parts.sort()
		return `${varCount}|${parts.join(';')}`
	}

	/**
	 * Brute force enumeration using DFS with constraint propagation.
	 * Tries all 2^varCount assignments, but prunes branches early when constraints
	 * become impossible to satisfy. Tracks mine counts per constraint to enable pruning.
	 */
	private bruteForce(
		varCount: number,
		constraints: RegionConstraint[],
	): { counts: number[]; total: number } {
		const counts = new Array<number>(varCount).fill(0)
		const hasImpossibleConstraint = constraints.some(
			constraint =>
				constraint.mines < 0 ||
				constraint.mines > constraint.indices.length,
		)
		if (hasImpossibleConstraint) return { counts, total: 0 }

		// Track mine count and unknown count for each constraint
		const mineInConstraint = new Array<number>(constraints.length).fill(0)
		const unknownInConstraint = constraints.map(rc => rc.indices.length)
		// Precompute which constraints each variable appears in (for efficient updates)
		const consForVar: number[][] = Array.from({ length: varCount }, () => [])
		constraints.forEach((rc, ci) => {
			rc.indices.forEach(idx => consForVar[idx].push(ci))
		})

		let totalValid = 0
		const assignment: boolean[] = new Array(varCount)

		const dfs = (idx: number) => {
			// Base case: all variables assigned, check if valid
			if (idx === varCount) {
				totalValid++
				for (let i = 0; i < varCount; i++) if (assignment[i]) counts[i]++
				return
			}

			// Try assigning variable as safe (false)
			let pruned = false
			for (const ci of consForVar[idx]) {
				unknownInConstraint[ci]--
				// Prune if constraint already has too many mines, or can't reach required count
				if (
					mineInConstraint[ci] > constraints[ci].mines ||
					mineInConstraint[ci] + unknownInConstraint[ci] <
						constraints[ci].mines
				) {
					pruned = true
				}
			}
			if (!pruned) {
				assignment[idx] = false
				dfs(idx + 1)
			}
			// Restore state
			for (const ci of consForVar[idx]) unknownInConstraint[ci]++

			// Try assigning variable as mine (true)
			pruned = false
			for (const ci of consForVar[idx]) {
				mineInConstraint[ci]++
				unknownInConstraint[ci]--
				if (
					mineInConstraint[ci] > constraints[ci].mines ||
					mineInConstraint[ci] + unknownInConstraint[ci] <
						constraints[ci].mines
				) {
					pruned = true
				}
			}
			if (!pruned) {
				assignment[idx] = true
				dfs(idx + 1)
			}
			// Restore state
			for (const ci of consForVar[idx]) {
				mineInConstraint[ci]--
				unknownInConstraint[ci]++
			}
		}
		dfs(0)
		return { counts, total: totalValid }
	}

	/** Ищет точные значения, проверяя выполнимость обоих значений переменной. */
	private processByLookAhead(vars: string[], cons: Constraint[]): boolean {
		let updated = false
		const varCount = vars.length
		const budget: SearchBudget = {
			remainingNodes: this.lookaheadNodesRemaining,
		}
		const indexOf = new Map<string, number>()
		vars.forEach((v, i) => indexOf.set(v, i))
		const regionCons: RegionConstraint[] = cons.map(c => ({
			indices: c.neighbors.map(n => indexOf.get(n)!),
			mines: c.mines,
		}))

		for (let localIdx = 0; localIdx < varCount; localIdx++) {
			const key = vars[localIdx]
			const existing = this.probabilities.get(key)
			if (existing?.value === 0 || existing?.value === 1) continue

			const canBeSafe = this.hasSolutionForced(
				localIdx,
				false,
				varCount,
				regionCons,
				budget,
			)
			const canBeMine = this.hasSolutionForced(
				localIdx,
				true,
				varCount,
				regionCons,
				budget,
			)

			if (canBeSafe === 'unsatisfiable' && canBeMine === 'satisfiable') {
				updated = this.probabilities.setExact(key, 1, parseKey(key)) || updated
			} else if (
				canBeSafe === 'satisfiable' &&
				canBeMine === 'unsatisfiable'
			) {
				updated = this.probabilities.setExact(key, 0, parseKey(key)) || updated
			}

			if (budget.remainingNodes === 0) break
		}

		this.lookaheadNodesRemaining = budget.remainingNodes
		return updated
	}

	/**
	 * Проверяет выполнимость системы при фиксированном значении переменной.
	 * При исчерпании общего бюджета возвращает неопределённый результат.
	 */
	private hasSolutionForced(
		forcedIdx: number,
		forcedValue: boolean,
		varCount: number,
		constraints: RegionConstraint[],
		budget: SearchBudget,
	): Satisfiability {
		const map: number[] = []
		let newIdx = 0
		for (let i = 0; i < varCount; i++) {
			if (i === forcedIdx) {
				map[i] = -1
			} else {
				map[i] = newIdx++
			}
		}

		const newCons: RegionConstraint[] = []
		for (const rc of constraints) {
			let mines = rc.mines
			const indices: number[] = []
			for (const idx of rc.indices) {
				if (idx === forcedIdx) {
					if (forcedValue) mines--
				} else {
					indices.push(map[idx])
				}
			}
			if (mines < 0 || mines > indices.length) return 'unsatisfiable'
			newCons.push({ indices, mines })
		}

		const key = this.createConstraintsKey(varCount - 1, newCons)
		const enumeration = this.enumerationCache.get(key)
		if (enumeration) {
			return enumeration.total > 0 ? 'satisfiable' : 'unsatisfiable'
		}

		const cached = this.satisfiabilityCache.get(key)
		if (cached !== undefined) {
			return cached ? 'satisfiable' : 'unsatisfiable'
		}

		const result = this.findSatisfyingAssignment(
			varCount - 1,
			newCons,
			budget,
		)
		if (result !== 'budget-exceeded') {
			this.satisfiabilityCache.set(key, result === 'satisfiable')
		}
		return result
	}

	private findSatisfyingAssignment(
		varCount: number,
		constraints: RegionConstraint[],
		budget: SearchBudget,
	): Satisfiability {
		for (const constraint of constraints) {
			if (
				constraint.mines < 0 ||
				constraint.mines > constraint.indices.length
			) {
				return 'unsatisfiable'
			}
		}

		const mineInConstraint = new Array<number>(constraints.length).fill(0)
		const unknownInConstraint = constraints.map(
			constraint => constraint.indices.length,
		)
		const constraintsForVariable: number[][] = Array.from(
			{ length: varCount },
			() => [],
		)
		constraints.forEach((constraint, constraintIndex) => {
			for (const variableIndex of constraint.indices) {
				constraintsForVariable[variableIndex].push(constraintIndex)
			}
		})

		const variableOrder = Array.from(
			{ length: varCount },
			(_, index) => index,
		).sort(
			(left, right) =>
				constraintsForVariable[right].length -
				constraintsForVariable[left].length,
		)

		const search = (depth: number): Satisfiability => {
			if (budget.remainingNodes === 0) return 'budget-exceeded'
			budget.remainingNodes--
			if (depth === varCount) return 'satisfiable'

			const variableIndex = variableOrder[depth]
			for (let value = 0; value <= 1; value++) {
				const isMine = value === 1
				let isFeasible = true

				for (const constraintIndex of constraintsForVariable[
					variableIndex
				]) {
					unknownInConstraint[constraintIndex]--
					if (isMine) mineInConstraint[constraintIndex]++

					const requiredMines = constraints[constraintIndex].mines
					if (
						mineInConstraint[constraintIndex] > requiredMines ||
						mineInConstraint[constraintIndex] +
							unknownInConstraint[constraintIndex] <
							requiredMines
					) {
						isFeasible = false
					}
				}

				const result = isFeasible
					? search(depth + 1)
					: 'unsatisfiable'

				for (const constraintIndex of constraintsForVariable[
					variableIndex
				]) {
					unknownInConstraint[constraintIndex]++
					if (isMine) mineInConstraint[constraintIndex]--
				}

				if (result !== 'unsatisfiable') return result
			}

			return 'unsatisfiable'
		}

		return search(0)
	}
}
