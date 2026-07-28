import { createKey } from '../lib/utils'

import type { CellData, ConstructorCellProps } from './types'

export class Cell {
	public readonly key: string
	public readonly position: ConstructorCellProps['position']
	public isMine: boolean
	public isRevealed: boolean
	public isFlagged: boolean
	public adjacentMines: number

	constructor({
		position,
		adjacentMines = 0,
		isFlagged = false,
		isMine = false,
		isRevealed = false,
	}: ConstructorCellProps) {
		if (!Number.isSafeInteger(adjacentMines) || adjacentMines < 0) {
			throw new RangeError(
				`Invalid adjacent mine count: ${String(adjacentMines)}.`,
			)
		}

		this.position = { ...position }
		this.key = createKey(position)
		this.isMine = isMine
		this.isRevealed = isRevealed
		this.isFlagged = isFlagged
		this.adjacentMines = adjacentMines
	}

	get isEmpty(): boolean {
		return !this.isMine && this.adjacentMines === 0
	}

	get isExploded(): boolean {
		return this.isMine && this.isRevealed
	}

	get isMissed(): boolean {
		return this.isFlagged && !this.isMine
	}

	get notFoundMine(): boolean {
		return this.isMine && !this.isFlagged
	}

	get isUntouched(): boolean {
		return !this.isRevealed && !this.isFlagged
	}

	static createCell(props: ConstructorCellProps): Cell {
		return new Cell(props)
	}

	clone(): Cell {
		return new Cell({
			position: { ...this.position },
			adjacentMines: this.adjacentMines,
			isFlagged: this.isFlagged,
			isMine: this.isMine,
			isRevealed: this.isRevealed,
		})
	}

	toData(): CellData {
		return {
			key: this.key,
			position: { ...this.position },
			isMine: this.isMine,
			isRevealed: this.isRevealed,
			isFlagged: this.isFlagged,
			adjacentMines: this.adjacentMines,
			isEmpty: this.isEmpty,
			isExploded: this.isExploded,
			isMissed: this.isMissed,
			notFoundMine: this.notFoundMine,
			isUntouched: this.isUntouched,
		}
	}
}
