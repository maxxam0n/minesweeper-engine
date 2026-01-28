import type {
	Constraint,
	RegionConstraint,
} from '../../model/field-solver.types'
import { ProbabilityStore } from './probability-store'

const MAX_FULL_ENUM_VARS = 18
const MAX_LOOKAHEAD_VARS = 30

export class RegionEnumerator {
	private static enumerationCache = new Map<
		string,
		{ total: number; counts: number[] }
	>()

	constructor(private readonly probabilities: ProbabilityStore) {}

	/**
	 * Evaluates a subregion by enumerating all valid mine configurations.
	 * Uses different strategies based on region size:
	 * - Small regions (≤18 vars): full enumeration with caching
	 * - Medium regions (≤30 vars): lookahead to find certain mines/safe cells
	 * - Large regions: skipped (too expensive)
	 */
	public evaluateSubregion(vars: string[], cons: Constraint[]): boolean {
		let updated = false

		if (vars.length <= MAX_FULL_ENUM_VARS) {
			// Full enumeration: count how many valid configurations have each variable as mine
			const { counts, total } = this.enumerateRegion(vars, cons)
			if (total === 0) return false

			// Calculate probability for each variable: configurations with mine / total configurations
			for (let i = 0; i < vars.length; i++) {
				const key = vars[i]
				const probValue = counts[i] / total
				if (this.probabilities.setProbability(key, probValue)) {
					updated = true
				}
			}
		} else if (vars.length <= MAX_LOOKAHEAD_VARS) {
			// Lookahead: for each variable, check if it can be forced to be mine or safe
			if (this.processByLookAhead(vars, cons)) {
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

		// Check cache to avoid re-enumerating identical constraint systems
		let cached = RegionEnumerator.enumerationCache.get(key)
		if (!cached) {
			cached = this.bruteForce(canonicalVars.length, canonicalConstraints)
			RegionEnumerator.enumerationCache.set(key, cached)
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
		// Track mine count and unknown count for each constraint
		const mineInConstraint = new Array<number>(constraints.length).fill(0)
		const unknownInConstraint = constraints.map(rc => rc.indices.length)
		// Precompute which constraints each variable appears in (for efficient updates)
		const consForVar: number[][] = Array.from({ length: varCount }, () => [])
		constraints.forEach((rc, ci) => {
			rc.indices.forEach(idx => consForVar[idx].push(ci))
		})

		const counts = new Array<number>(varCount).fill(0)
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

	/**
	 * Lookahead strategy for medium-sized regions: for each variable, check if
	 * forcing it to be safe or mine leads to an impossible constraint system.
	 * If only one value is possible, we've found a certainty.
	 */
	private processByLookAhead(vars: string[], cons: Constraint[]): boolean {
		let updated = false
		const varCount = vars.length
		const indexOf = new Map<string, number>()
		vars.forEach((v, i) => indexOf.set(v, i))
		const regionCons: RegionConstraint[] = cons.map(c => ({
			indices: c.neighbors.map(n => indexOf.get(n)!),
			mines: c.mines,
		}))

		for (let localIdx = 0; localIdx < varCount; localIdx++) {
			const key = vars[localIdx]
			if (this.probabilities.has(key)) continue

			// Check if there exists a valid solution with this variable as safe
			const canBeSafe = this.hasSolutionForced(
				localIdx,
				false,
				varCount,
				regionCons,
			)
			// Check if there exists a valid solution with this variable as mine
			const canBeMine = this.hasSolutionForced(
				localIdx,
				true,
				varCount,
				regionCons,
			)

			// If only one value is possible, we've found a certainty
			if (!canBeSafe && canBeMine) {
				updated = this.probabilities.setProbability(key, 1) || updated
			} else if (canBeSafe && !canBeMine) {
				updated = this.probabilities.setProbability(key, 0) || updated
			}
		}
		return updated
	}

	/**
	 * Checks if there exists a valid solution when a variable is forced to a specific value.
	 * Reduces the constraint system by removing the forced variable and adjusting
	 * constraint mine counts accordingly. Returns true if at least one valid solution exists.
	 */
	private hasSolutionForced(
		forcedIdx: number,
		forcedValue: boolean,
		varCount: number,
		constraints: RegionConstraint[],
	): boolean {
		// Create mapping to reindex variables after removing forced variable
		const map: number[] = []
		let newIdx = 0
		for (let i = 0; i < varCount; i++) {
			if (i === forcedIdx) {
				map[i] = -1 // Mark forced variable
			} else {
				map[i] = newIdx++
			}
		}

		// Build new constraint system with forced variable removed
		const newCons: RegionConstraint[] = []
		for (const rc of constraints) {
			let mines = rc.mines
			const indices: number[] = []
			for (const idx of rc.indices) {
				if (idx === forcedIdx) {
					// If forced variable is a mine, reduce required mine count
					if (forcedValue) mines--
				} else {
					indices.push(map[idx])
				}
			}
			// If constraint becomes impossible, no solution exists
			if (mines < 0 || mines > indices.length) return false
			newCons.push({ indices, mines })
		}

		// Check cache or enumerate to see if reduced system has solutions
		const key = this.createConstraintsKey(varCount - 1, newCons)
		const cached = RegionEnumerator.enumerationCache.get(key)
		if (cached) return cached.total > 0

		const result = this.bruteForce(varCount - 1, newCons)
		return result.total > 0
	}
}
