import type { FieldGeometry, GameParams, Position } from '../types'

/*
 * Representation: even-q vertical layout (columns are "straight",
 * even columns are shifted down). This allows storing the field as a regular
 * rectangular array rows × cols.
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

export class HexagonalGeometry implements FieldGeometry {
	constructor(public readonly params: GameParams) {}

	public isInBoundary({ row, col }: Position): boolean {
		return (
			col >= 0 &&
			row >= 0 &&
			col < this.params.cols &&
			row < this.params.rows
		)
	}

	public getSiblings({ row, col }: Position): Position[] {
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

		const siblings: Position[] = []

		const offsets = col % 2 === 0 ? evenOffsets : oddOffsets
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
