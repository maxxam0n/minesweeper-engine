import {
	CellData,
	ConstrutorFieldProps,
	FieldState,
	GameParams,
	Position,
} from './types'
import { SimpleCell } from './simple-cell'

export abstract class BaseField<T extends SimpleCell> {
	readonly params: GameParams

	public grid: T[][]
	public isMined: boolean
	protected rng: () => number

	constructor({ params, data, rng = Math.random }: ConstrutorFieldProps) {
		this.params = params
		this.grid = this.createGrid(data)
		this.isMined = this.grid.some(row => row.some(cell => cell.isMine))
		this.rng = rng
	}

	// Для восстановления игры
	protected abstract createGrid(data?: CellData[][]): T[][]
	// Для рассчета состояния FieldState
	protected abstract getData(): CellData[][]

	// Для управления минами
	public abstract placeMines(): void
	public abstract relocateMine(from: Position, to: Position): void

	// Вспомогательные публичные методы
	// Для создания предварительного состояния игры(класс GameEngine, Solver)
	public abstract cloneSelf(): BaseField<T>

	// Для управления полем извне (класс GameEngine, Solver), мутируемые клетки
	public abstract getSiblings(pos: Position): T[]
	public abstract getAreaToReveal(pos: Position): T[]
	public abstract getCell(pos: Position): T

	// Для ui. Не мутирующие поле данные
	public abstract getCellData(position: Position): CellData

	// Предоставляем наружу не мутирующие поле данные (CellData)
	public getState(): FieldState {
		const data = this.getData()

		const acc = {
			minedCells: [],
			explodedCells: [],
			flaggedCells: [],
			notFoundMines: [],
			errorFlags: [],
			revealedCells: [],
			field: data,
		}

		return data.flat().reduce<FieldState>((acc, cell) => {
			if (cell.isMine) acc.minedCells.push(cell)
			if (cell.isFlagged) acc.flaggedCells.push(cell)
			if (cell.isRevealed) acc.revealedCells.push(cell)
			if (cell.isExploded) acc.explodedCells.push(cell)
			if (cell.isMissed) acc.errorFlags.push(cell)
			if (cell.notFoundMine) acc.notFoundMines.push(cell)

			return acc
		}, acc)
	}
}
