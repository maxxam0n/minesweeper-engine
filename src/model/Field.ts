import { createGrid, createKey } from '../lib/utils'
import { getRandomIndex } from '../lib/random'
import { Cell } from './Cell'
import {
	createFullFieldSnapshot,
	createIncrementalFieldSnapshot,
} from './field-snapshot.utils'

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

	private cellGrid: FieldCellGrid

	/** Readonly-представление внутренней сетки поля. */
	public get grid(): ReadonlyArray<ReadonlyArray<Cell | null>> {
		return this.cellGrid
	}

	private ownedRows: Set<number> | null = null
	private ownedCells: Set<string> | null = null
	private baseSnapshot: FieldState | null = null
	private dirtyCells: Map<string, Cell> | null = null
	private incrementalSnapshot: FieldState | null = null

	/**
	 * Creates a new Field instance.
	 * @param params - Game parameters (dimensions, mine count)
	 * @param data - Optional pre-existing grid data
	 * @param rng - Optional custom random number generator (defaults to Math.random)
	 * @param geometry - Geometry handler for field operations
	 */
	constructor({
		params,
		data,
		rng,
		geometry,
		excludeFromMines,
	}: ConstructorFieldProps) {
		this.params = { ...params }

		this.geometry = geometry
		this.cellGrid = data ? this.normalizeGrid(data) : this.createGrid()

		this.rng = rng ?? Math.random
		// `data` — готовая раскладка (редактор / persist / clone); RNG только для пустого поля
		this.minesPlaced =
			data != null || this.cellGrid.some(r => r.some(c => c?.isMine))
		this.placeMines(excludeFromMines)
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
		return data.map((row, rowIndex) =>
			row.map((cell, colIndex) =>
				cell
					? Cell.createCell({
							position: { row: rowIndex, col: colIndex },
							adjacentMines: cell.adjacentMines,
							isFlagged: cell.isFlagged,
							isMine: cell.isMine,
							isRevealed: cell.isRevealed,
						})
					: null,
			),
		)
	}

	/**
	 * Retrieves a cell at the specified position.
	 * @param position - The position to query
	 * @returns The cell instance or null if position is out of bounds
	 */
	public getCell({ col, row }: Position): Cell | null {
		return this.cellGrid[row]?.[col] ?? null
	}

	/**
	 * Создаёт дешёвую изменяемую версию поля.
	 * Строки и клетки копируются только перед первой записью в них.
	 */
	public forkForMutation(baseSnapshot: FieldState): Field {
		const fork = new Field({
			geometry: this.geometry,
			params: this.params,
			data: [],
			rng: this.rng,
		})
		fork.cellGrid = [...this.cellGrid]
		fork.ownedRows = new Set()
		fork.ownedCells = new Set()
		fork.baseSnapshot = baseSnapshot
		fork.dirtyCells = new Map()
		return fork
	}

	public setCellRevealed(position: Position, value: boolean): Cell | null {
		const current = this.getCell(position)
		if (!current || current.isRevealed === value) return current

		const cell = this.getWritableCell(position)
		if (!cell) return null

		cell.isRevealed = value
		return cell
	}

	public setCellFlagged(position: Position, value: boolean): Cell | null {
		const current = this.getCell(position)
		if (!current || current.isFlagged === value) return current

		const cell = this.getWritableCell(position)
		if (!cell) return null

		cell.isFlagged = value
		return cell
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
	public mineCell(position: Position): boolean {
		const current = this.getCell(position)
		if (!current) {
			console.warn(
				`[Field] Cannot place mine: cell does not exist at position (row: ${position.row}, col: ${position.col})`,
			)
			return false
		}
		if (current.isMine) return false

		const cell = this.getWritableCell(position)
		if (!cell) return false

		cell.isMine = true
		this.getSiblings(position).forEach(sibling => {
			const writableSibling = this.getWritableCell(sibling.position)
			if (writableSibling) writableSibling.adjacentMines++
		})
		return true
	}

	/**
	 * Removes a mine from the specified position and updates adjacent cell counters.
	 * @param position - The position where the mine should be removed
	 */
	public unMineCell(position: Position): boolean {
		const current = this.getCell(position)
		if (!current) {
			console.warn(
				`[Field] Cannot remove mine: cell does not exist at position (row: ${position.row}, col: ${position.col})`,
			)
			return false
		}
		if (!current.isMine) return false

		const cell = this.getWritableCell(position)
		if (!cell) return false

		cell.isMine = false
		this.getSiblings(position).forEach(sibling => {
			const writableSibling = this.getWritableCell(sibling.position)
			if (writableSibling) writableSibling.adjacentMines--
		})
		return true
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
	 * Случайная расстановка мин. `excludeFromMines` убирает клетки из кандидатов
	 * (стартовая позиция и соседи для zero opening / solvable-генератора).
	 */
	private placeMines(excludeFromMines?: Position[]): void {
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

		const excluded = new Set(
			(excludeFromMines ?? []).map(pos => createKey(pos)),
		)
		const candidates =
			excluded.size === 0
				? [...basePositions]
				: basePositions.filter(pos => !excluded.has(createKey(pos)))

		if (mines > candidates.length) {
			console.warn(
				`[Field] Mines count (${mines}) exceeds available cells (${candidates.length}). Clamping.`,
			)
		}

		const targetMines = Math.min(mines, candidates.length)
		for (let i = 0; i < targetMines; i++) {
			const idx = getRandomIndex(candidates.length, this.rng)
			const position = candidates.splice(idx, 1)[0]
			this.mineCell(position)
		}
	}

	/**
	 * Переносит мину с `from` на `to` и пересчитывает соседние счётчики.
	 */
	public relocateMine(from: Position, to: Position): boolean {
		const source = this.getCell(from)
		const destination = this.getCell(to)
		if (!source?.isMine || !destination || destination.isMine) return false

		this.unMineCell(from)
		this.mineCell(to)
		return true
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

		for (let queueIndex = 0; queueIndex < queue.length; queueIndex++) {
			const cell = queue[queueIndex]
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
	 * Возвращаемые данные заморожены и безопасны для structural sharing.
	 * @returns FieldState object containing categorized cell arrays and the full grid
	 */
	public getFieldSnapshot(): FieldState {
		if (this.incrementalSnapshot) return this.incrementalSnapshot
		if (!this.baseSnapshot || !this.dirtyCells) {
			return createFullFieldSnapshot(this.cellGrid)
		}

		this.incrementalSnapshot = createIncrementalFieldSnapshot(
			this.baseSnapshot,
			[...this.dirtyCells.values()],
		)
		this.baseSnapshot = null
		this.dirtyCells = null
		return this.incrementalSnapshot
	}

	private toDataGrid(): FieldGrid {
		return this.cellGrid.map(row =>
			row.map(cell => (cell ? cell.toData() : null)),
		)
	}

	private getWritableCell({ col, row }: Position): Cell | null {
		const current = this.cellGrid[row]?.[col] ?? null
		if (!current || !this.ownedRows || !this.ownedCells) return current

		if (!this.ownedRows.has(row)) {
			this.cellGrid[row] = [...this.cellGrid[row]]
			this.ownedRows.add(row)
		}

		if (this.ownedCells.has(current.key)) {
			this.dirtyCells?.set(current.key, current)
			this.incrementalSnapshot = null
			return current
		}

		const ownedCell = current.clone()
		this.cellGrid[row][col] = ownedCell
		this.ownedCells.add(ownedCell.key)
		this.dirtyCells?.set(ownedCell.key, ownedCell)
		this.incrementalSnapshot = null
		return ownedCell
	}
}
