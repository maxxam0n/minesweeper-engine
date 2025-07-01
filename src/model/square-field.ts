import { createGrid, createKey } from '../lib/utils'
import { CellData, ConstrutorFieldProps, Position } from './types'
import { BaseField } from './base-field'
import { SimpleCell } from './simple-cell'

export class SquareField extends BaseField<SimpleCell> {
	constructor({ params, rng, data }: ConstrutorFieldProps) {
		super({ params, data, rng })
	}

	protected createGrid(data?: CellData[][]) {
		if (data) {
			return data.map(r => r.map(c => new SimpleCell(c)))
		}

		const { cols, rows } = this.params
		return createGrid(rows, cols, position => new SimpleCell({ position }))
	}

	protected getData() {
		return this.grid.map(row => row.map(cell => cell.getData()))
	}

	public placeMines() {
		if (this.isMined) return

		this.isMined = true
		const { cols, rows, mines } = this.params
		const avoidSet = new Set()

		let minesPlacedCount = 0
		while (minesPlacedCount < mines) {
			const position = {
				col: Math.floor(this.rng() * cols),
				row: Math.floor(this.rng() * rows),
			}
			const hash = createKey(position)

			if (!avoidSet.has(hash)) {
				avoidSet.add(hash)
				this.mineCell(position)
				minesPlacedCount += 1
			}
		}
	}

	public relocateMine(from: Position, to: Position) {
		this.unMineCell(from)
		this.mineCell(to)
	}

	/* ------------- Вспомогательные методы ------------- */
	private mineCell(position: Position) {
		this.getCell(position).isMine = true
		this.getSiblings(position).forEach(sib => sib.adjacentMines++)
	}

	private unMineCell(position: Position) {
		this.getCell(position).isMine = false
		this.getSiblings(position).forEach(sib => sib.adjacentMines--)
	}

	private isInBoundary({ row, col }: Position): boolean {
		return (
			col >= 0 &&
			row >= 0 &&
			col < this.params.cols &&
			row < this.params.rows
		)
	}

	public getAreaToReveal(position: Position): SimpleCell[] {
		const { cols, rows } = this.params

		const target = this.getCell(position)

		if (!target.isEmpty || target.isMine) return [target]

		const result: SimpleCell[] = []
		const queue: SimpleCell[] = [target]
		const visited: boolean[][] = createGrid(rows, cols, () => false)

		while (queue.length > 0) {
			const cell = queue.shift()!
			const { col, row } = cell.position

			if (visited[row][col]) continue
			if (cell.isEmpty) {
				const siblings = this.getSiblings(cell.position)
				queue.push(...siblings)
			}

			visited[row][col] = true
			result.push(cell)
		}

		return result
	}

	public getSiblings({ row, col }: Position): SimpleCell[] {
		const siblings: SimpleCell[] = []
		for (let dx = -1; dx <= 1; dx++) {
			for (let dy = -1; dy <= 1; dy++) {
				if (dx === 0 && dy === 0) continue
				const position = { col: col + dx, row: row + dy }
				if (this.isInBoundary(position)) {
					siblings.push(this.getCell(position))
				}
			}
		}
		return siblings
	}

	public cloneSelf() {
		return new SquareField({
			rng: this.rng,
			params: this.params,
			data: this.grid,
		})
	}

	public getCell({ row, col }: Position): SimpleCell {
		return this.grid[row][col]
	}

	public getCellData(position: Position): CellData {
		return this.getCell(position).getData()
	}
}
