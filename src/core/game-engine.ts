import { createKey } from '../lib/utils'
import { isValidGameParams } from '../lib/validate-params'
import type { BaseField } from '../model/base-field'
import { FieldFactory } from '../model/field-factory'
import { SimpleCell } from '../model/simple-cell'
import type {
	ActionResult,
	CellData,
	FieldState,
	FieldType,
	GameMode,
	GameParams,
	GameSnapshot,
	GameStatus,
	MineSweeperConfig,
	Position,
} from '../model/types'

import { Solver } from './field-solver'

/**
 * Main game engine for managing minesweeper game state and actions.
 * Handles cell revelation, flagging, game status, and mode-specific logic.
 */
export class GameEngine {
	private mode: GameMode
	private fieldType: FieldType
	private field: BaseField<SimpleCell> | null
	private params: GameParams
	private status: GameStatus

	private flagsRemaining: number

	/**
	 * Creates a new game engine instance.
	 * @param config - Game configuration including field type, parameters, and optional mode
	 * @param config.mode - Game mode ('guessing' or 'no-guessing'). Defaults to 'guessing'
	 */
	constructor({ mode = 'guessing', ...config }: MineSweeperConfig) {
		this.mode = mode
		this.fieldType = config.type
		this.params = config.params
		this.status = 'idle'

		// Защита от невалидных параметров: не инициализируем поле, чтобы не падать/не зависать.
		if (!isValidGameParams(this.params)) {
			this.field = null
			this.flagsRemaining = 0
			return
		}

		this.field = FieldFactory.create(config)
		this.flagsRemaining = config.params.mines
	}

	/**
	 * Reveals a cell at the specified position.
	 * On the first click, mines are placed ensuring the clicked cell is safe.
	 * In 'no-guessing' mode, prevents revealing cells when solver detects uncertain states.
	 * Supports chord clicking (clicking on revealed cells to reveal adjacent safe cells).
	 * @param pos - Position of the cell to reveal
	 * @returns ActionResult containing the changes and a function to apply them
	 */
	public revealCell(this: GameEngine, pos: Position): ActionResult {
		if (!this.field) return GameEngine.emptyActionResult(pos)
		let actionStatus: GameStatus = this.status
		const operetadField = this.field.cloneSelf()

		const flaggedCells: CellData[] = []
		const unflaggedCells: CellData[] = []
		const revealedCells: CellData[] = []
		const handledCells: CellData[] = []
		const explodedCells: CellData[] = []

		// 1. Обработка первого клика / начала игры
		if (actionStatus === 'idle') {
			if (!operetadField.isMined) operetadField.placeMines(pos)
			if (operetadField.getCellData(pos).isMine) {
				const unminedCell = operetadField.grid.flat().find(cell => !cell.isMine)
				if (!unminedCell) {
					actionStatus = 'lost'
				} else {
					operetadField.relocateMine(pos, unminedCell.position)
					actionStatus = 'playing'
				}
			} else {
				actionStatus = 'playing'
			}
		}

		const target = operetadField.getCell(pos)

		// 2. Основная логика
		if (actionStatus === 'playing' && !target.isFlagged) {
			const cellData = target.getData()

			if (target.isMine) {
				const handleLoss = () => {
					// Обычная логика проигрыша
					target.isRevealed = true
					handledCells.push(cellData)
					explodedCells.push(cellData)
				}

				if (this.mode === 'no-guessing') {
					const solver = new Solver({
						params: this.params,
						type: this.fieldType,
						data: operetadField.getState().field,
					})

					const probabilities = solver.solve()

					if (solver.isGuessingState(probabilities)) {
						if (probabilities.some(p => p.value === 1 && createKey(p.position) === target.key)) {
							// Состояние угадывания, но клик по клетке с вероятностью мины - 100% = проигрыш
							handleLoss()
						} else {
							return this.toggleFlag(pos)
						}
					} else {
						// Не состояние угадывания, проигрыш
						handleLoss()
					}
				} else {
					// Режим угадывания, проигрыш
					handleLoss()
				}
			} else if (target.isRevealed) {
				// chord/chording. Когда кликаем по открытой клетке
				const result = this.handleRevealedClick(target, operetadField)
				revealedCells.push(...result.revealedCells)
				unflaggedCells.push(...result.unflaggedCells)
				explodedCells.push(...result.explodedCells)
				handledCells.push(...result.handledCells)
			} else {
				// Невскрытая и не мина
				handledCells.push(cellData)
				const result = this.openArea(pos, operetadField)
				revealedCells.push(...result.revealedCells)
				unflaggedCells.push(...result.unflaggedCells)
			}
		}

		const resultState = operetadField.getState()
		actionStatus = this.determineStatus(resultState)

		const applyAction = () => {
			this.status = actionStatus
			this.field = operetadField
			this.flagsRemaining = this.getFlagsRemaining(resultState)
		}

		return {
			data: {
				actionSnapshot: Object.assign(resultState, {
					status: actionStatus,
				}),
				actionChanges: {
					target,
					explodedCells,
					flaggedCells,
					revealedCells,
					handledCells,
					unflaggedCells,
				},
			},
			apply: applyAction,
		}
	}

	/**
	 * Toggles the flag state of a cell at the specified position.
	 * Only works on unrevealed cells during active gameplay.
	 * @param pos - Position of the cell to flag/unflag
	 * @returns ActionResult containing the changes and a function to apply them
	 */
	public toggleFlag(this: GameEngine, pos: Position): ActionResult {
		if (!this.field) return GameEngine.emptyActionResult(pos)
		const operetadField = this.field.cloneSelf()

		const flaggedCells: CellData[] = []
		const unflaggedCells: CellData[] = []

		const cell = operetadField.getCell(pos)
		const cellData = cell.getData()

		if (this.status === 'playing' && !cell.isRevealed) {
			if (cell.isFlagged) {
				// Снимаем флаг
				cell.isFlagged = false
				unflaggedCells.push(cellData)
			} else if (this.flagsRemaining > 0) {
				// Ставим флаг
				cell.isFlagged = true
				flaggedCells.push(cellData)
			}
		}

		const resultState = operetadField.getState()

		const applyAction = () => {
			this.field = operetadField
			this.flagsRemaining = this.getFlagsRemaining(resultState)
		}

		return {
			data: {
				actionSnapshot: Object.assign(resultState, { status: this.status }),
				actionChanges: {
					explodedCells: [],
					flaggedCells,
					unflaggedCells,
					handledCells: [],
					revealedCells: [],
					target: cellData,
				},
			},
			apply: applyAction,
		}
	}

	private handleRevealedClick(targetCell: CellData, operatedField: BaseField<SimpleCell>) {
		const unflaggedCells: CellData[] = []
		const revealedCells: CellData[] = []
		const handledCells: CellData[] = []
		const explodedCells: CellData[] = []

		const siblings = operatedField.getSiblings(targetCell.position)
		const closedSiblings = siblings.filter(({ isUntouched }) => isUntouched)
		const flags = siblings.reduce((sum, sib) => sum + +sib.isFlagged, 0)

		// Условие открытия внутри аккорда
		if (flags === targetCell.adjacentMines) {
			handledCells.push(...closedSiblings.map(sib => sib.getData()))

			for (const sibCell of siblings) {
				if (sibCell.isFlagged || sibCell.isRevealed) continue

				if (sibCell.isMine && !sibCell.isFlagged) {
					// Проигрыш внутри аккорда
					sibCell.isRevealed = true
					explodedCells.push(sibCell.getData())
				} else {
					// Открываем безопасную ячейку или пустую область
					const openResult = this.openArea(sibCell.position, operatedField)
					revealedCells.push(...openResult.revealedCells)
					unflaggedCells.push(...openResult.unflaggedCells)
				}
			}
		}

		return {
			unflaggedCells,
			revealedCells,
			handledCells,
			explodedCells,
		}
	}

	private openArea(pos: Position, operatedField: BaseField<SimpleCell>) {
		const unflaggedCells: CellData[] = []
		const revealedCells: CellData[] = []

		const area = operatedField.getAreaToReveal(pos)

		area.forEach(cellToProcess => {
			const cellData = cellToProcess.getData()
			if (cellToProcess.isFlagged) {
				cellToProcess.isFlagged = false
				unflaggedCells.push(cellData)
			}
			if (!cellToProcess.isRevealed) {
				cellToProcess.isRevealed = true
				revealedCells.push(cellData)
			}
		})
		return { unflaggedCells, revealedCells }
	}

	private determineStatus(resultState: FieldState) {
		const revealedCount = resultState.revealedCells.length
		const { cols, mines, rows } = this.params

		if (resultState.explodedCells.length > 0) return 'lost'
		else if (revealedCount === cols * rows - mines) return 'won'
		else return 'playing'
	}

	private getFlagsRemaining(resultState: FieldState) {
		return this.params.mines - resultState.flaggedCells.length
	}

	/**
	 * Gets the current complete game state snapshot.
	 * @returns GameSnapshot containing field state and current game status
	 */
	get gameSnapshot(): GameSnapshot {
		if (!this.field) return GameEngine.emptySnapshot(this.status)
		return Object.assign(this.field.getState(), { status: this.status })
	}

	/**
	 * Creates an empty game snapshot for invalid or uninitialized game states.
	 * @param status - Game status to assign to the snapshot
	 * @returns Empty GameSnapshot with the specified status
	 */
	static emptySnapshot(status: GameStatus): GameSnapshot {
		return {
			status,
			field: [],
			minedCells: [],
			explodedCells: [],
			flaggedCells: [],
			notFoundMines: [],
			errorFlags: [],
			revealedCells: [],
		}
	}

	/**
	 * Creates an empty action result for invalid actions.
	 * @param pos - Position that was targeted by the action
	 * @returns Empty ActionResult with no-op apply function
	 */
	static emptyActionResult(pos: Position): ActionResult {
		const target = SimpleCell.createEmpty(pos)
		return {
			data: {
				actionSnapshot: GameEngine.emptySnapshot('idle'),
				actionChanges: {
					target,
					handledCells: [],
					flaggedCells: [],
					unflaggedCells: [],
					revealedCells: [],
					explodedCells: [],
				},
			},
			apply: () => {},
		}
	}
}
