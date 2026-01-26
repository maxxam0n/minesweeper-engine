import { createGrid } from '../lib/utils'

import { BaseField } from './base-field'
import { SimpleCell } from './simple-cell'
import type { CellData, ConstrutorFieldProps, Position } from './types'

export class SquareField extends BaseField<SimpleCell> {
	constructor({ params, data, rng }: ConstrutorFieldProps) {
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

	public cloneSelf() {
		return new SquareField({
			params: this.params,
			data: this.getData(),
			rng: this.rng,
		})
	}

	public getCell({ row, col }: Position): SimpleCell {
		return this.grid[row][col]
	}

	public getCellData(position: Position): CellData {
		return this.getCell(position).getData()
	}
}
