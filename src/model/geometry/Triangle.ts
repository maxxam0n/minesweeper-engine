import type { FieldGeometry, GameParams, Position } from '../types'

/*
 * Triangular grid: each triangle can be oriented
 * with its vertex pointing up or down.
 *
 * Orientation: (row + col) % 2 === 0 -> pointing up
 *
 * Neighbors for pointing up (▲):
 *   - Top left: (row - 1, col - 1)
 *   - Top right: (row - 1, col + 1)
 *   - Bottom: (row + 1, col)
 *
 * Neighbors for pointing down (▼):
 *   - Bottom left: (row + 1, col - 1)
 *   - Bottom right: (row + 1, col + 1)
 *   - Top: (row - 1, col)
 */

export class TriangularGeometry implements FieldGeometry {
	constructor(public readonly params: GameParams) {}

	/**
	 * Triangle orientation:
	 * - stepX = size/2, stepY = h
	 * - isUp = (row + col) % 2 === 0
	 */
	private isPointingUp(row: number, col: number) {
		return ((row + col) & 1) === 0
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
		/**
		 * Neighbors are triangles that share AT LEAST ONE VERTEX (not just an edge).
		 *
		 * Each triangle has 12 neighbors:
		 * - 3 edge neighbors
		 * - + 9 vertex neighbors (unique)
		 *
		 * Implementation without float geometry:
		 * 1) Find 3 vertices of the current triangle in integer grid coordinates
		 * 2) For each vertex, enumerate 6 triangles that contain it
		 * 3) Combine and remove self
		 */

		const selfKey = `${col}-${row}`
		const uniq = new Map<string, Position>()
		const up = this.isPointingUp(row, col)

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

		// For each vertex, enumerate 6 triangles around it
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
				uniq.set(k, p)
			}

			for (const p of downCandidates) {
				if (!this.isInBoundary(p)) continue
				if (this.isPointingUp(p.row, p.col)) continue
				const k = `${p.col}-${p.row}`
				if (k === selfKey) continue
				uniq.set(k, p)
			}
		}

		return Array.from(uniq.values())
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
