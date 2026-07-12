import { createGrid } from '../lib/utils'
import { Cell } from './Cell'

import type {
	ConstructorFieldProps,
	FieldCellGrid,
	FieldGeometry,
	FieldGrid,
	FieldState,
	GameParams,
	Position,
} from './types'

/**
 * Represents a minesweeper game field with cells, mines, and game state management.
 * Handles mine placement, cell revelation, and field state tracking.
 */
export class Field {
	/** Game parameters including dimensions and mine count */
	public readonly params: GameParams

	/** Random number generator function for mine placement */
	public readonly rng: () => number

	/** Geometry handler for field-specific operations (square, hexagonal, triangular) */
	public readonly geometry: FieldGeometry

	/** Indicates whether mines have been placed on the field */
	private minesPlaced: boolean

	/** Internal grid representation of the field cells */
	public grid: FieldCellGrid

	/**
	 * Creates a new Field instance.
	 * @param params - Game parameters (dimensions, mine count)
	 * @param data - Optional pre-existing grid data
	 * @param rng - Optional custom random number generator (defaults to Math.random)
	 * @param geometry - Geometry handler for field operations
	 */
	constructor({ params, data, rng, geometry }: ConstructorFieldProps) {
		this.params = params

		this.geometry = geometry
		this.grid = data ? this.normalizeGrid(data) : this.createGrid()

		this.rng = rng ?? Math.random
		// `data` — готовая раскладка (редактор / persist / clone); RNG только для пустого поля
		this.minesPlaced =
			data != null || this.grid.some(r => r.some(c => c?.isMine))
		this.placeMines()
	}

	/**
	 * Creates a new empty grid based on field parameters and geometry.
	 * @returns A new grid with cells initialized only within valid boundaries
	 */
	private createGrid(): FieldCellGrid {
		const { cols, rows } = this.params
		return createGrid(rows, cols, p => {
			if (this.geometry.isInBoundary(p)) {
				return Cell.createCell({ position: p })
			} else return null
		})
	}

	private normalizeGrid(data: FieldGrid): FieldCellGrid {
		return data.map(row =>
			row.map(cell => (cell ? Cell.createCell(cell) : null)),
		)
	}

	/**
	 * Retrieves a cell at the specified position.
	 * @param position - The position to query
	 * @returns The cell instance or null if position is out of bounds
	 */
	public getCell({ col, row }: Position): Cell | null {
		return this.grid[row][col]
	}

	/**
	 * Gets all valid sibling cells adjacent to the given position.
	 * @param position - The position to find siblings for
	 * @returns Array of valid sibling cell instances
	 */
	public getSiblings(position: Position): Cell[] {
		return this.geometry
			.getSiblings(position)
			.map(s => this.getCell(s))
			.filter(c => c !== null)
	}

	/**
	 * Places a mine at the specified position and updates adjacent cell counters.
	 * @param position - The position where the mine should be placed
	 */
	public mineCell(position: Position): void {
		const cell = this.getCell(position)
		if (cell) {
			cell.isMine = true
			this.getSiblings(position).forEach(sib => {
				sib.adjacentMines++
			})
		} else {
			console.warn(
				`[Field] Cannot place mine: cell does not exist at position (row: ${position.row}, col: ${position.col})`,
			)
		}
	}

	/**
	 * Removes a mine from the specified position and updates adjacent cell counters.
	 * @param position - The position where the mine should be removed
	 */
	public unMineCell(position: Position): void {
		const cell = this.getCell(position)
		if (cell) {
			cell.isMine = false
			this.getSiblings(position).forEach(sib => {
				sib.adjacentMines--
			})
		} else {
			console.warn(
				`[Field] Cannot remove mine: cell does not exist at position (row: ${position.row}, col: ${position.col})`,
			)
		}
	}

	/**
	 * Retrieves a copy of cell data at the specified position.
	 * @param position - The position to query
	 * @returns A new Cell instance or null if position is out of bounds
	 */
	public cloneCell(position: Position): Cell | null {
		const cell = this.getCell(position)
		return cell ? cell.clone() : null
	}

	/**
	 * Creates a deep copy of the current grid.
	 * @returns A cloned grid with cell data snapshots
	 */
	public cloneGrid() {
		return this.toDataGrid()
	}

	/**
	 * Creates a deep copy of the current field instance.
	 * @returns A new Field instance with cloned grid and same parameters
	 */
	public cloneSelf(): Field {
		return new Field({
			geometry: this.geometry,
			params: this.params,
			data: this.toDataGrid(),
			rng: this.rng,
		})
	}

	/**
	 * Places mines randomly across the field.
	 * Optional `excludedPos` skips one cell (legacy deferred-placement helper).
	 * The engine prefers early placement + `relocateMine` on first click instead.
	 * @param excludedPos - Optional position to exclude from candidates
	 */
	private placeMines(excludedPos?: Position): void {
		if (this.minesPlaced) return

		this.minesPlaced = true

		const { cols, rows, mines } = this.params
		const basePositions =
			this.geometry.getAllPositions?.() ??
			(() => {
				const positions: Position[] = []
				for (let row = 0; row < rows; row++) {
					for (let col = 0; col < cols; col++) {
						const position = { row, col }
						if (this.geometry.isInBoundary(position))
							positions.push(position)
					}
				}
				return positions
			})()

		const candidates = excludedPos
			? basePositions.filter(
					pos =>
						!(pos.row === excludedPos.row && pos.col === excludedPos.col),
				)
			: [...basePositions]

		if (mines > candidates.length) {
			console.warn(
				`[Field] Mines count (${mines}) exceeds available cells (${candidates.length}). Clamping.`,
			)
		}

		const targetMines = Math.min(mines, candidates.length)
		for (let i = 0; i < targetMines; i++) {
			const idx = Math.floor(this.rng() * candidates.length)
			const position = candidates.splice(idx, 1)[0]
			this.mineCell(position)
		}
	}

	/**
	 * Moves a mine from one position to another.
	 * @param from - Source position to remove the mine from
	 * @param to - Target position to place the mine at
	 */
	public relocateMine(from: Position, to: Position) {
		this.unMineCell(from)
		this.mineCell(to)
	}

	/**
	 * Determines which cells should be revealed when a cell at the given position is clicked.
	 * Uses BFS to reveal all connected empty cells and their numbered neighbors.
	 * @param position - The position of the cell that was clicked
	 * @returns Array of cells that should be revealed
	 */
	public getAreaToReveal(position: Position): Cell[] {
		const target = this.getCell(position)
		if (!target) {
			console.warn(
				`[Field] Cannot reveal area: cell does not exist at position (row: ${position.row}, col: ${position.col})`,
			)
			return []
		}

		if (!target.isEmpty || target.isMine) return [target]

		const { cols, rows } = this.params
		const result: Cell[] = []
		const queue: Cell[] = [target]
		const visited: boolean[][] = createGrid(rows, cols, () => false)

		while (queue.length) {
			const cell = queue.shift()!
			const { row, col } = cell.position
			if (visited[row][col]) continue

			if (cell.isEmpty) {
				queue.push(...this.getSiblings(cell.position))
			}

			visited[row][col] = true
			result.push(cell)
		}
		return result
	}

	/**
	 * Generates a comprehensive snapshot of the current field state.
	 * @returns FieldState object containing categorized cell arrays and the full grid
	 */
	public getFieldSnapshot(): FieldState {
		const field = this.toDataGrid()

		return field.flat().reduce<FieldState>(
			(acc, cell) => {
				if (cell?.isMine) acc.minedCells.push(cell)
				if (cell?.isFlagged) acc.flaggedCells.push(cell)
				if (cell?.isRevealed) acc.revealedCells.push(cell)
				if (cell?.isExploded) acc.explodedCells.push(cell)
				if (cell?.isMissed) acc.errorFlags.push(cell)
				if (cell?.notFoundMine) acc.notFoundMines.push(cell)

				return acc
			},
			{
				field,
				revealedCells: [],
				flaggedCells: [],
				minedCells: [],
				explodedCells: [],
				notFoundMines: [],
				errorFlags: [],
			},
		)
	}

	private toDataGrid(): FieldGrid {
		return this.grid.map(row =>
			row.map(cell => (cell ? cell.toData() : null)),
		)
	}
}
