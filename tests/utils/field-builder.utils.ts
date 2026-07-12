import { BoardEditor } from '../../src/model/board-editor'
import type {
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

/** Тестовый хелпер поверх публичного BoardEditor. */
export const buildGrid = (
	params: GameParams,
	geometry: FieldGeometry,
	{ mines, revealed, flagged }: GridOptions = {},
): FieldGrid => {
	const editor = BoardEditor.create({ params, geometry })
	if (mines?.length) editor.mine(mines)
	if (revealed?.length) editor.reveal(revealed)
	if (flagged?.length) editor.flag(flagged)
	return editor.build()
}
