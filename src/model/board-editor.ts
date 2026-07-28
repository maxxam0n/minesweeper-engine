import { createGrid, createKey, parseKey } from '../lib/utils'
import { Cell } from './Cell'
import { Field } from './Field'
import type { BoardEditorConfig } from './board-editor.types'
import type {
	CellData,
	FieldGeometry,
	FieldGrid,
	GameParams,
	Position,
} from './types'

const toPositions = (positions: Position | Position[]): Position[] =>
	Array.isArray(positions) ? positions : [positions]

/**
 * Fluent-редактор детерминированного поля (пазлы, туториалы, тесты).
 * Не запускает RNG: мины и состояние клеток задаются явно.
 */
export class BoardEditor {
	private readonly params: GameParams
	private readonly geometry: FieldGeometry
	private readonly mines = new Set<string>()
	private readonly revealed = new Set<string>()
	private readonly flagged = new Set<string>()

	private constructor(params: GameParams, geometry: FieldGeometry) {
		this.params = { ...params }
		this.geometry = geometry
	}

	public static create(config: BoardEditorConfig): BoardEditor {
		return new BoardEditor(config.params, config.geometry)
	}

	/** Параметры с `mines` = фактическое число установленных мин. */
	public get gameParams(): GameParams {
		return { ...this.params, mines: this.mines.size }
	}

	public get fieldGeometry(): FieldGeometry {
		return this.geometry
	}

	public mine(positions: Position | Position[]): this {
		for (const pos of toPositions(positions)) {
			this.assertInBounds(pos)
			this.mines.add(createKey(pos))
		}
		return this
	}

	public unmine(positions: Position | Position[]): this {
		for (const pos of toPositions(positions)) {
			this.mines.delete(createKey(pos))
		}
		return this
	}

	public reveal(positions: Position | Position[]): this {
		for (const pos of toPositions(positions)) {
			this.assertInBounds(pos)
			const key = createKey(pos)
			this.revealed.add(key)
			this.flagged.delete(key)
		}
		return this
	}

	public cover(positions: Position | Position[]): this {
		for (const pos of toPositions(positions)) {
			this.revealed.delete(createKey(pos))
		}
		return this
	}

	public flag(positions: Position | Position[]): this {
		for (const pos of toPositions(positions)) {
			this.assertInBounds(pos)
			const key = createKey(pos)
			this.flagged.add(key)
			this.revealed.delete(key)
		}
		return this
	}

	public unflag(positions: Position | Position[]): this {
		for (const pos of toPositions(positions)) {
			this.flagged.delete(createKey(pos))
		}
		return this
	}

	/** Сбрасывает reveal/flag у указанных клеток (мины не трогает). */
	public clearMarks(positions: Position | Position[]): this {
		for (const pos of toPositions(positions)) {
			const key = createKey(pos)
			this.revealed.delete(key)
			this.flagged.delete(key)
		}
		return this
	}

	/** Собирает `FieldGrid` для передачи в Engine / Solver как `data`. */
	public build(): FieldGrid {
		const { rows, cols } = this.params
		const adjacent = createGrid<number>(rows, cols, () => 0)

		for (const key of this.mines) {
			const pos = parseKey(key)
			for (const sibling of this.geometry.getSiblings(pos)) {
				adjacent[sibling.row][sibling.col] += 1
			}
		}

		return createGrid<FieldGrid[number][number]>(rows, cols, pos => {
			if (!this.geometry.isInBoundary(pos)) return null

			const key = createKey(pos)
			const cell: CellData = Cell.createCell({
				position: pos,
				isMine: this.mines.has(key),
				adjacentMines: adjacent[pos.row][pos.col],
				isRevealed: this.revealed.has(key),
				isFlagged: this.flagged.has(key),
			}).toData()

			return cell
		})
	}

	/**
	 * Собирает `Field` с уже расставленными минами (`placeMines` не вызывается повторно).
	 * `params.mines` выравнивается под фактическое число мин.
	 */
	public buildField(): Field {
		return new Field({
			params: this.gameParams,
			geometry: this.geometry,
			data: this.build(),
		})
	}

	private assertInBounds(pos: Position): void {
		if (!this.geometry.isInBoundary(pos)) {
			throw new Error(
				`BoardEditor: position out of bounds (row: ${pos.row}, col: ${pos.col})`,
			)
		}
	}
}
