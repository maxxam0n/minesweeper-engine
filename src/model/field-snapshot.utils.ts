import type { Cell } from './Cell'
import type { CellData, FieldCellGrid, FieldState } from './types'

type CellCategory = Exclude<keyof FieldState, 'field'>

type FieldSnapshotBuilder = {
	field: FieldState['field']
} & {
	[Category in CellCategory]: readonly CellData[]
}

const categoryPredicates = {
	minedCells: (cell: CellData) => cell.isMine,
	explodedCells: (cell: CellData) => cell.isExploded,
	flaggedCells: (cell: CellData) => cell.isFlagged,
	notFoundMines: (cell: CellData) => cell.notFoundMine,
	errorFlags: (cell: CellData) => cell.isMissed,
	revealedCells: (cell: CellData) => cell.isRevealed,
} satisfies Record<CellCategory, (cell: CellData) => boolean>

const categoryNames = Object.keys(categoryPredicates) as CellCategory[]

const freezeCellData = (cell: CellData): CellData => {
	Object.freeze(cell.position)
	Object.freeze(cell)
	return cell
}

const freezeSnapshot = (snapshot: FieldSnapshotBuilder): FieldState => {
	for (const row of snapshot.field) Object.freeze(row)
	Object.freeze(snapshot.field)
	for (const categoryName of categoryNames) {
		Object.freeze(snapshot[categoryName])
	}
	Object.freeze(snapshot)
	return snapshot
}

const compareCells = (left: CellData, right: CellData): number =>
	left.position.row - right.position.row ||
	left.position.col - right.position.col

const mergeCells = (
	previous: readonly CellData[],
	replacements: readonly CellData[],
	replacedKeys: ReadonlySet<string>,
): CellData[] => {
	const retained = previous.filter(cell => !replacedKeys.has(cell.key))
	const merged: CellData[] = []
	let retainedIndex = 0
	let replacementIndex = 0

	while (
		retainedIndex < retained.length ||
		replacementIndex < replacements.length
	) {
		const retainedCell = retained[retainedIndex]
		const replacementCell = replacements[replacementIndex]

		if (
			replacementCell &&
			(!retainedCell || compareCells(replacementCell, retainedCell) < 0)
		) {
			merged.push(replacementCell)
			replacementIndex++
		} else if (retainedCell) {
			merged.push(retainedCell)
			retainedIndex++
		}
	}

	return merged
}

export const createFullFieldSnapshot = (grid: FieldCellGrid): FieldState => {
	const field = grid.map(row =>
		row.map(cell => (cell ? freezeCellData(cell.toData()) : null)),
	)
	const categories: Record<CellCategory, CellData[]> = {
		revealedCells: [],
		flaggedCells: [],
		minedCells: [],
		explodedCells: [],
		notFoundMines: [],
		errorFlags: [],
	}

	for (const row of field) {
		for (const cell of row) {
			if (!cell) continue

			for (const categoryName of categoryNames) {
				if (categoryPredicates[categoryName](cell)) {
					categories[categoryName].push(cell)
				}
			}
		}
	}

	const snapshot: FieldSnapshotBuilder = { field, ...categories }
	return freezeSnapshot(snapshot)
}

export const createIncrementalFieldSnapshot = (
	base: FieldState,
	dirtyCells: readonly Cell[],
): FieldState => {
	if (dirtyCells.length === 0) return base

	const replacements = dirtyCells
		.map(cell => freezeCellData(cell.toData()))
		.sort(compareCells)
	const replacedKeys = new Set(replacements.map(cell => cell.key))
	const field: Array<ReadonlyArray<CellData | null>> = [...base.field]
	const copiedRows = new Map<number, Array<CellData | null>>()

	for (const cell of replacements) {
		const { col, row } = cell.position
		let copiedRow = copiedRows.get(row)
		if (!copiedRow) {
			copiedRow = [...field[row]]
			field[row] = copiedRow
			copiedRows.set(row, copiedRow)
		}
		copiedRow[col] = cell
	}

	const snapshot: FieldSnapshotBuilder = {
		field,
		revealedCells: base.revealedCells,
		flaggedCells: base.flaggedCells,
		minedCells: base.minedCells,
		explodedCells: base.explodedCells,
		notFoundMines: base.notFoundMines,
		errorFlags: base.errorFlags,
	}

	for (const categoryName of categoryNames) {
		const predicate = categoryPredicates[categoryName]
		const affectsCategory = replacements.some(cell => {
			const previous = base.field[cell.position.row][cell.position.col]
			return predicate(cell) || (previous ? predicate(previous) : false)
		})
		if (!affectsCategory) continue

		snapshot[categoryName] = mergeCells(
			base[categoryName],
			replacements.filter(predicate),
			replacedKeys,
		)
	}

	return freezeSnapshot(snapshot)
}
