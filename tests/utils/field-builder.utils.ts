import { createGrid, createKey } from '../../src/lib/utils'
import { Cell } from '../../src/model/Cell'
import type {
	CellData,
	FieldGeometry,
	FieldGrid,
	GameParams,
	Position,
} from '../../src/model/types'

type GridOptions = {
	mines?: Position[]
	revealed?: Position[]
	flagged?: Position[]
}

const toKeySet = (positions: Position[] | undefined) => {
	return new Set((positions ?? []).map(createKey))
}

export const listPositions = (
	params: GameParams,
	geometry: FieldGeometry,
): Position[] => {
	const result: Position[] = []
	for (let row = 0; row < params.rows; row++) {
		for (let col = 0; col < params.cols; col++) {
			const pos = { row, col }
			if (geometry.isInBoundary(pos)) result.push(pos)
		}
	}
	return result
}

export const buildGrid = (
	params: GameParams,
	geometry: FieldGeometry,
	{ mines, revealed, flagged }: GridOptions = {},
): FieldGrid => {
	const mineSet = toKeySet(mines)
	const revealedSet = toKeySet(revealed)
	const flaggedSet = toKeySet(flagged)

	const adjacent = createGrid<number>(params.rows, params.cols, () => 0)
	;(mines ?? []).forEach(pos => {
		for (const sibling of geometry.getSiblings(pos)) {
			adjacent[sibling.row][sibling.col] += 1
		}
	})

	return createGrid<FieldGrid[number][number]>(
		params.rows,
		params.cols,
		pos => {
			if (!geometry.isInBoundary(pos)) return null
			const key = createKey(pos)
			const isMine = mineSet.has(key)
			const adjacentMines = adjacent[pos.row][pos.col]
			const isRevealed = revealedSet.has(key)
			const isFlagged = flaggedSet.has(key)

			const cell: CellData = Cell.createCell({
				position: pos,
				isMine,
				adjacentMines,
				isRevealed,
				isFlagged,
			}).toData()

			return cell
		},
	)
}
