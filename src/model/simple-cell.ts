import { createKey } from '../lib/utils'
import { CellData, ConstructorCellProps, Position } from './types'

export class SimpleCell implements CellData {
	public readonly key: string
	public readonly position: Position
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
		this.key = createKey(position)
		this.position = position
		this.isMine = isMine
		this.isRevealed = isRevealed
		this.isFlagged = isFlagged
		this.adjacentMines = adjacentMines
	}

	public get isEmpty() {
		return !this.isMine && this.adjacentMines === 0
	}

	public get isExploded() {
		return this.isMine && this.isRevealed
	}

	public get isMissed() {
		return this.isFlagged && !this.isMine
	}

	public get notFoundMine() {
		return this.isMine && !this.isFlagged
	}

	public get isUntouched() {
		return !this.isRevealed && !this.isFlagged
	}

	public getData(): CellData {
		return {
			...this,
			isEmpty: this.isEmpty,
			isExploded: this.isExploded,
			notFoundMine: this.notFoundMine,
			isUntouched: this.isUntouched,
			isMissed: this.isMissed,
		}
	}
}
