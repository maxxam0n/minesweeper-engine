import { createGrid } from '../lib/utils'

import { BaseField } from './base-field'
import { SimpleCell } from './simple-cell'
import type { CellData, ConstrutorFieldProps, Position } from './types'

/*
 * Треугольная сетка: каждый треугольник может быть ориентирован
 * вершиной вверх (pointing up) или вниз (pointing down).
 *
 * Ориентация: (row + col) % 2 === 0 -> pointing up
 *
 * Соседи для pointing up (▲):
 *   - Вверху слева: (row - 1, col - 1)
 *   - Вверху справа: (row - 1, col + 1)
 *   - Внизу: (row + 1, col)
 *
 * Соседи для pointing down (▼):
 *   - Внизу слева: (row + 1, col - 1)
 *   - Внизу справа: (row + 1, col + 1)
 *   - Вверху: (row - 1, col)
 */

export class TriangularField extends BaseField<SimpleCell> {
	constructor({ params, data, rng }: ConstrutorFieldProps) {
		super({ params, data, rng })
	}

	/**
	 * Ориентация треугольника в нашей раскладке UI:
	 * - stepX = size/2, stepY = h
	 * - isUp = (row + col) % 2 === 0
	 */
	private isPointingUp(row: number, col: number) {
		return ((row + col) & 1) === 0
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
		/**
		 * Вариант "как на скрине": соседями считаются треугольники,
		 * которые разделяют ХОТЯ БЫ ОДНУ ВЕРШИНУ (а не только ребро).
		 *
		 * Тогда у каждого треугольника получается 12 соседей:
		 * - 3 по ребрам
		 * - + 9 по вершинам (уникальные)
		 *
		 * Реализуем это без float-геометрии:
		 * 1) находим 3 вершины текущего треугольника в целочисленных координатах решетки
		 * 2) вокруг каждой вершины перечисляем 6 треугольников, которые её содержат
		 * 3) объединяем, убираем себя
		 */

		const selfKey = `${col}-${row}`
		const uniq = new Map<string, SimpleCell>()
		const up = this.isPointingUp(row, col)

		// Вершины в "индексах" решетки (xIndex, yIndex), где x шаг = size/2, y шаг = h
		// См. client/src/widgets/minesweeper-game/lib/geometry/triangular.ts
		const vertices: Array<{ vx: number; vy: number }> = up
			? [
					{ vx: col + 1, vy: row }, // apex
					{ vx: col, vy: row + 1 }, // left base
					{ vx: col + 2, vy: row + 1 }, // right base
				]
			: [
					{ vx: col, vy: row }, // left top
					{ vx: col + 2, vy: row }, // right top
					{ vx: col + 1, vy: row + 1 }, // apex bottom
				]

		// Для каждой вершины перечисляем 6 треугольников вокруг неё.
		for (const { vx, vy } of vertices) {
			// Up-triangles containing vertex (vx,vy):
			// 1) (c+1,r) => c=vx-1, r=vy
			// 2) (c,r+1) => c=vx,   r=vy-1
			// 3) (c+2,r+1)=>c=vx-2, r=vy-1
			const upCandidates: Position[] = [
				{ col: vx - 1, row: vy },
				{ col: vx, row: vy - 1 },
				{ col: vx - 2, row: vy - 1 },
			]

			// Down-triangles containing vertex (vx,vy):
			// 1) (c,r)     => c=vx,   r=vy
			// 2) (c+2,r)   => c=vx-2, r=vy
			// 3) (c+1,r+1) => c=vx-1, r=vy-1
			const downCandidates: Position[] = [
				{ col: vx, row: vy },
				{ col: vx - 2, row: vy },
				{ col: vx - 1, row: vy - 1 },
			]

			for (const p of upCandidates) {
				if (!this.isInBoundary(p)) continue
				if (!this.isPointingUp(p.row, p.col)) continue
				const k = `${p.col}-${p.row}`
				if (k === selfKey) continue
				uniq.set(k, this.getCell(p))
			}
			for (const p of downCandidates) {
				if (!this.isInBoundary(p)) continue
				if (this.isPointingUp(p.row, p.col)) continue
				const k = `${p.col}-${p.row}`
				if (k === selfKey) continue
				uniq.set(k, this.getCell(p))
			}
		}

		return Array.from(uniq.values())
	}

	/* ---------- Инструментальные методы ---------- */
	public cloneSelf() {
		return new TriangularField({
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
