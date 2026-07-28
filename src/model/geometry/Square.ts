import type { FieldGeometry, GameParams, Position } from '../types'

/**
 * Квадратная сетка с восемью соседями: четыре по сторонам и четыре по диагоналям.
 * Поле хранится в обычном прямоугольном массиве `rows × cols`.
 */

export class SquareGeometry implements FieldGeometry {
	public readonly params: GameParams

	constructor(params: GameParams) {
		this.params = { ...params }
	}

	public isInBoundary({ row, col }: Position): boolean {
		return (
			col >= 0 &&
			row >= 0 &&
			col < this.params.cols &&
			row < this.params.rows
		)
	}

	public getSiblings({ row, col }: Position): Position[] {
		const siblings: Position[] = []

		const offsets = [
			{ dx: -1, dy: -1 },
			{ dx: 0, dy: -1 },
			{ dx: 1, dy: -1 },
			{ dx: -1, dy: 0 },
			{ dx: 1, dy: 0 },
			{ dx: -1, dy: 1 },
			{ dx: 0, dy: 1 },
			{ dx: 1, dy: 1 },
		]

		for (const { dx, dy } of offsets) {
			const pos = { col: col + dx, row: row + dy }
			if (this.isInBoundary(pos)) siblings.push(pos)
		}

		return siblings
	}

	public getAllPositions(): Position[] {
		const result: Position[] = []
		for (let row = 0; row < this.params.rows; row++) {
			for (let col = 0; col < this.params.cols; col++) {
				const pos = { row, col }
				if (this.isInBoundary(pos)) result.push(pos)
			}
		}
		return result
	}
}
