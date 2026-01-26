import { createGrid } from '../lib/utils'

import { BaseField } from './base-field'
import { SimpleCell } from './simple-cell'
import type { CellData, ConstrutorFieldProps, Position } from './types'

/*
 * Представление: even-q вертикальная раскладка (колонки стоят «ровно»,
 * чётные столбцы смещены вниз). Это позволяет хранить поле как обычный
 * прямоугольный массив rows × cols.
 *
 *   even-q offsets (col % 2 === 0)
 *        (-1,+0)  (+1,+0)
 *   (-1,-1)            (+1,-1)
 *        (-1,+1)  (+1,+1)
 *
 *   odd-q offsets (col % 2 === 1)
 *        (-1,+0)  (+1,+0)
 *   (-1,+1)            (+1,+1)
 *        (-1,-1)  (+1,-1)
 */

export class HexagonalField extends BaseField<SimpleCell> {
	constructor({ params, data, rng }: ConstrutorFieldProps) {
		super({ params, data, rng })
	}

	/* ---------- Генерация / сериализация ---------- */
	protected createGrid(data?: CellData[][]) {
		if (data) return data.map(r => r.map(c => new SimpleCell(c)))
		const { cols, rows } = this.params
		return createGrid(rows, cols, position => new SimpleCell({ position }))
	}

	protected getData() {
		return this.grid.map(r => r.map(c => c.getData()))
	}

	/* ---------- Специфичная логика соседей ---------- */
	public override getSiblings({ row, col }: Position): SimpleCell[] {
		const evenOffsets = [
			{ dx: +1, dy: 0 },
			{ dx: 1, dy: -1 },
			{ dx: 0, dy: -1 },
			{ dx: -1, dy: -1 },
			{ dx: -1, dy: 0 },
			{ dx: 0, dy: 1 },
		]

		const oddOffsets = [
			{ dx: +1, dy: 0 },
			{ dx: 0, dy: -1 },
			{ dx: -1, dy: 0 },
			{ dx: -1, dy: 1 },
			{ dx: 0, dy: 1 },
			{ dx: +1, dy: 1 },
		]
		const offsets = col % 2 === 0 ? evenOffsets : oddOffsets
		const result: SimpleCell[] = []
		for (const { dx, dy } of offsets) {
			const pos = { col: col + dx, row: row + dy }
			if (this.isInBoundary(pos)) result.push(this.getCell(pos))
		}
		return result
	}

	/* ---------- Инструментальные методы ---------- */
	public cloneSelf() {
		return new HexagonalField({
			params: this.params,
			rng: this.rng,
			data: this.getData(),
		})
	}

	public getCell({ row, col }: Position): SimpleCell {
		return this.grid[row][col]
	}

	public getCellData(position: Position): CellData {
		return this.getCell(position).getData()
	}
}
