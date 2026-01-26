import { createGrid, createKey } from '../lib/utils'

import type { SimpleCell } from './simple-cell'
import type { CellData, ConstrutorFieldProps, FieldState, GameParams, Position } from './types'

export abstract class BaseField<T extends SimpleCell> {
	readonly params: GameParams

	public grid: T[][]
	public isMined: boolean
	protected rng: () => number

	constructor({ params, data, rng }: ConstrutorFieldProps) {
		this.params = params
		this.grid = this.createGrid(data)
		this.rng = rng ?? Math.random
		this.isMined = this.grid.some(row => row.some(cell => cell.isMine))
		if (!this.isMined) this.placeMines()
	}

	// Для восстановления игры
	protected abstract createGrid(data?: CellData[][]): T[][]
	// Для рассчета состояния FieldState
	protected abstract getData(): CellData[][]

	// Для управления минами (можно переопределить при необходимости)
	public placeMines(pos?: Position): void {
		if (this.isMined) return
		this.isMined = true
		const { cols, rows, mines } = this.params
		const avoidSet = new Set<string>()

		if (pos) avoidSet.add(createKey(pos))

		let placed = 0
		while (placed < mines) {
			const position = {
				col: Math.floor(this.rng() * cols),
				row: Math.floor(this.rng() * rows),
			}
			const hash = createKey(position)
			if (avoidSet.has(hash)) continue

			avoidSet.add(hash)
			this.mineCell(position)
			placed++
		}
	}

	public relocateMine(from: Position, to: Position): void {
		this.unMineCell(from)
		this.mineCell(to)
	}

	/* --------- Общая вспомогательная логика ---------- */
	protected mineCell(position: Position): void {
		this.getCell(position).isMine = true
		this.getSiblings(position).forEach(sib => sib.adjacentMines++)
	}

	protected unMineCell(position: Position): void {
		this.getCell(position).isMine = false
		this.getSiblings(position).forEach(sib => sib.adjacentMines--)
	}

	// Вспомогательные публичные методы
	// Для создания предварительного состояния игры(класс GameEngine, Solver)
	public abstract cloneSelf(): BaseField<T>

	// Для управления полем извне (класс GameEngine, Solver)
	// По умолчанию возвращаем 8 соседей вокруг клетки в прямоугольной сетке
	// Специализированные поля (hex, triangle) могут переопределить метод
	public getSiblings(pos: Position): T[] {
		const siblings: T[] = []
		for (let dx = -1; dx <= 1; dx++) {
			for (let dy = -1; dy <= 1; dy++) {
				if (dx === 0 && dy === 0) continue
				const neighbor = { col: pos.col + dx, row: pos.row + dy }
				if (this.isInBoundary(neighbor)) siblings.push(this.getCell(neighbor))
			}
		}
		return siblings as T[]
	}

	protected isInBoundary({ row, col }: Position): boolean {
		return col >= 0 && row >= 0 && col < this.params.cols && row < this.params.rows
	}

	// Можно переопределить для особых полей, но дефолт работает для любого прямоугольного расположения
	public getAreaToReveal(position: Position): T[] {
		const target = this.getCell(position)
		if (!target.isEmpty || target.isMine) return [target]

		const { cols, rows } = this.params
		const result: T[] = []
		const queue: T[] = [target]
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

	// Для ui. Не мутирующие поле данные
	public abstract getCell(pos: Position): T

	// Для управления полем извне (класс GameEngine, Solver), мутируемые клетки
	public abstract getCellData(position: Position): CellData

	// Предоставляем наружу не мутирующие поле данные (CellData)
	public getState(): FieldState {
		const data = this.getData()

		const acc = {
			minedCells: [],
			explodedCells: [],
			flaggedCells: [],
			notFoundMines: [],
			errorFlags: [],
			revealedCells: [],
			field: data,
		}

		return data.flat().reduce<FieldState>((acc, cell) => {
			if (cell.isMine) acc.minedCells.push(cell)
			if (cell.isFlagged) acc.flaggedCells.push(cell)
			if (cell.isRevealed) acc.revealedCells.push(cell)
			if (cell.isExploded) acc.explodedCells.push(cell)
			if (cell.isMissed) acc.errorFlags.push(cell)
			if (cell.notFoundMine) acc.notFoundMines.push(cell)

			return acc
		}, acc)
	}
}
