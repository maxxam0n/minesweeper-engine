import { Field } from '../model/Field'
import type { CellData, MineProbability } from '../model/types'
import type { FieldView, SolverConfig } from '../model/field-solver.types'
import { DirectInference } from './field-solver/direct-inference'
import { ProbabilityStore } from './field-solver/probability-store'
import { RegionAnalyzer } from './field-solver/region-analyzer'
import { RegionEnumerator } from './field-solver/region-enumerator'

export class Solver {
	private field: FieldView
	private probabilities: ProbabilityStore
	private directInference: DirectInference
	private regionAnalyzer: RegionAnalyzer
	private regionEnumerator: RegionEnumerator

	constructor(config: SolverConfig) {
		this.field = Solver.resolveFieldView(config)
		this.probabilities = new ProbabilityStore()
		this.directInference = new DirectInference(this.field, this.probabilities)
		this.regionAnalyzer = new RegionAnalyzer(this.field)
		this.regionEnumerator = new RegionEnumerator(this.probabilities)
	}

	public isGuessingState(probabilities: MineProbability[]): boolean {
		for (const prob of probabilities) {
			if (prob.value === 0) {
				return false
			}
		}
		return true
	}

	public createConnectedRegions(): CellData[][] {
		const fieldState = this.field.getFieldSnapshot()
		return this.regionAnalyzer.createConnectedRegions(
			fieldState.revealedCells,
		)
	}

	/**
	 * Main solving algorithm that applies inference rules in order until no more
	 * certainties can be determined. Then computes probability estimates for remaining cells.
	 *
	 * Algorithm flow:
	 * 1. Direct inference: certain mines and safe cells from revealed numbers
	 * 2. Subset difference: compare overlapping constraints to find differences
	 * 3. Set theory: full constraint enumeration for complex regions
	 * 4. Local ratios: probability estimates for cells that couldn't be determined with certainty
	 */
	public solve(): MineProbability[] {
		const fieldState = this.field.getFieldSnapshot()
		this.probabilities.clear()
		this.regionEnumerator.clearCache()

		// Iteratively apply inference rules until no more updates are possible
		// Each rule may enable further inferences, so we loop until convergence
		let updated: boolean
		do {
			// Direct inference: certain mines / safe cells from revealed numbers
			// and already known solver probabilities (player flags are not trusted).
			updated =
				this.directInference.inferCertainMines(fieldState.revealedCells) ||
				this.directInference.inferCertainSafeCells(fieldState.revealedCells)

			if (updated) continue

			// Subset difference: if constraint A is a subset of constraint B, and their
			// mine counts differ by the size of the difference, we can determine the difference set
			updated = this.directInference.inferBySubsetDifference(
				fieldState.revealedCells,
			)

			if (updated) continue

			// Set theory: for complex regions with multiple overlapping constraints,
			// enumerate all valid mine configurations to find certain mines/safe cells
			updated = this.inferBySetTheory(fieldState.revealedCells)
		} while (updated)

		// After finding all certainties, compute probability estimates for remaining cells
		// based on local ratios (mines remaining / unknown cells) around each number cell
		this.directInference.inferByLocalRatios(fieldState.revealedCells)

		return this.probabilities.getAll()
	}

	/**
	 * Applies constraint satisfaction using set theory and enumeration.
	 * Groups revealed cells into connected regions, builds constraint systems,
	 * splits into independent subregions, and enumerates valid configurations
	 * to find certain mines and safe cells.
	 */
	private inferBySetTheory(cells: CellData[]): boolean {
		let updated = false

		// Group revealed cells into connected regions (cells that share closed neighbors)
		const regions = this.regionAnalyzer.createConnectedRegions(cells)

		for (const region of regions) {
			// Build constraint system: each revealed number cell creates a constraint
			// stating that exactly N of its closed neighbors are mines
			const { variables, constraints } =
				this.regionAnalyzer.buildConstraints(region)

			// Split region into independent subregions (connected components of variables)
			// This allows solving smaller subproblems independently
			const subregions = this.regionAnalyzer.splitIntoSubregions(
				variables,
				constraints,
			)

			// Evaluate each subregion by enumerating valid mine configurations
			for (const { vars, cons } of subregions) {
				if (this.regionEnumerator.evaluateSubregion(vars, cons)) {
					updated = true
				}
			}
		}

		return updated
	}

	private static resolveFieldView(config: SolverConfig): FieldView {
		if ('getFieldSnapshot' in config && 'getSiblings' in config) {
			return config
		}

		return new Field(config)
	}
}
