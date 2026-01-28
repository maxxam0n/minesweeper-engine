import { createKey } from '../lib/utils'
import { isValidGameParams } from '../lib/validate-params'
import { Cell } from '../model/Cell'
import { Field } from '../model/Field'
import { GeometryFactory } from '../model/geometry/Factory'
import type {
	ActionResult,
	CellData,
	FieldState,
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
	private field: Field | null
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
		this.params = config.params
		this.status = 'idle'

		// Protection against invalid parameters: don't initialize field to avoid crashes/hangs.
		if (!isValidGameParams(this.params)) {
			this.field = null
			this.flagsRemaining = 0
			return
		}

		const geometry = config.geometry || GeometryFactory.create(config)

		this.field = new Field({ ...config, geometry })

		this.flagsRemaining = this.field.getFieldSnapshot().minedCells.length
	}

	/**
	 * Reveals a cell at the specified position.
	 * On the first click, mines are placed ensuring the clicked cell is safe.
	 * In 'no-guessing' mode, prevents revealing cells when solver detects uncertain states.
	 * Supports chord clicking (clicking on revealed cells to reveal adjacent safe cells).
	 * @param pos - Position of the cell to reveal
	 * @returns ActionResult containing the changes and a function to apply them
	 */
	public revealCell(pos: Position): ActionResult {
		if (!this.field) {
			return GameEngine.emptyActionResult(pos)
		}

		let actionStatus: GameStatus = this.status
		const operetadField = this.field.cloneSelf()

		const flaggedCells: CellData[] = []
		const unflaggedCells: CellData[] = []
		const revealedCells: CellData[] = []
		const handledCells: CellData[] = []
		const explodedCells: CellData[] = []

		// 1. Handle first click / game start
		if (actionStatus === 'idle') {
			if (operetadField.cloneCell(pos)?.isMine) {
				const unminedCell = operetadField.grid
					.flat()
					.find(cell => cell && !cell.isMine)
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
		if (!target) {
			return GameEngine.emptyActionResult(pos)
		}

		// 2. Main logic
		if (actionStatus === 'playing' && !target.isFlagged) {
			if (target.isMine) {
				const handleLoss = () => {
					// Standard loss logic
					target.isRevealed = true
					const targetSnapshot = GameEngine.snapshotCell(target)
					handledCells.push(targetSnapshot)
					explodedCells.push(targetSnapshot)
				}

				if (this.mode === 'no-guessing') {
					const solver = new Solver(operetadField)

					const probabilities = solver.solve()

					if (solver.isGuessingState(probabilities)) {
						if (
							probabilities.some(
								p =>
									p.value === 1 &&
									createKey(p.position) === target.key,
							)
						) {
							// Guessing state, but click on cell with 100% mine probability = loss
							handleLoss()
						} else {
							return this.toggleFlag(pos)
						}
					} else {
						// Not a guessing state, loss
						handleLoss()
					}
				} else {
					// Guessing mode, loss
					handleLoss()
				}
			} else if (target.isRevealed) {
				// chord/chording. When clicking on a revealed cell
				const result = this.handleRevealedClick(target, operetadField)
				revealedCells.push(...result.revealedCells)
				unflaggedCells.push(...result.unflaggedCells)
				explodedCells.push(...result.explodedCells)
				handledCells.push(...result.handledCells)
			} else {
				// Unrevealed and not a mine
				const result = this.openArea(pos, operetadField)
				revealedCells.push(...result.revealedCells)
				unflaggedCells.push(...result.unflaggedCells)
				handledCells.push(GameEngine.snapshotCell(target))
			}
		}

		const resultState = operetadField.getFieldSnapshot()
		actionStatus = this.determineStatus(resultState)
		const targetSnapshot = GameEngine.snapshotCell(target)

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
					target: targetSnapshot,
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
	public toggleFlag(pos: Position): ActionResult {
		if (!this.field) return GameEngine.emptyActionResult(pos)
		const operetadField = this.field.cloneSelf()

		const flaggedCells: CellData[] = []
		const unflaggedCells: CellData[] = []

		const cell = operetadField.getCell(pos)
		if (!cell) return GameEngine.emptyActionResult(pos)

		if (this.status === 'playing' && !cell.isRevealed) {
			if (cell.isFlagged) {
				// Remove flag
				cell.isFlagged = false
				unflaggedCells.push(GameEngine.snapshotCell(cell))
			} else if (this.flagsRemaining > 0) {
				// Set flag
				cell.isFlagged = true
				flaggedCells.push(GameEngine.snapshotCell(cell))
			}
		}

		const resultState = operetadField.getFieldSnapshot()
		const targetSnapshot = GameEngine.snapshotCell(cell)

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
					target: targetSnapshot,
				},
			},
			apply: applyAction,
		}
	}

	private handleRevealedClick(targetCell: Cell, operatedField: Field) {
		const unflaggedCells: CellData[] = []
		const revealedCells: CellData[] = []
		const handledCells: CellData[] = []
		const explodedCells: CellData[] = []

		const siblings = operatedField.getSiblings(targetCell.position)
		const closedSiblings = siblings.filter(
			sib => !sib.isRevealed && !sib.isFlagged,
		)
		const flags = siblings.reduce(
			(sum, sib) => sum + (sib.isFlagged ? 1 : 0),
			0,
		)

		// Condition for opening within chord
		if (flags === targetCell.adjacentMines) {
			const handledTargets = [...closedSiblings]

			for (const sibCell of siblings) {
				if (sibCell.isFlagged || sibCell.isRevealed) continue

				if (sibCell.isMine && !sibCell.isFlagged) {
					// Loss within chord
					sibCell.isRevealed = true
					explodedCells.push(GameEngine.snapshotCell(sibCell))
				} else {
					// Open safe cell or empty area
					const openResult = this.openArea(sibCell.position, operatedField)
					revealedCells.push(...openResult.revealedCells)
					unflaggedCells.push(...openResult.unflaggedCells)
				}
			}

			handledCells.push(
				...handledTargets.map(cell => GameEngine.snapshotCell(cell)),
			)
		}

		return {
			unflaggedCells,
			revealedCells,
			handledCells,
			explodedCells,
		}
	}

	private openArea(pos: Position, operatedField: Field) {
		const unflaggedCells: CellData[] = []
		const revealedCells: CellData[] = []

		const area = operatedField.getAreaToReveal(pos)

		area.forEach(cellToProcess => {
			const wasFlagged = cellToProcess.isFlagged
			const wasRevealed = cellToProcess.isRevealed
			if (wasFlagged) {
				cellToProcess.isFlagged = false
				unflaggedCells.push(GameEngine.snapshotCell(cellToProcess))
			}
			if (!wasRevealed) {
				cellToProcess.isRevealed = true
				revealedCells.push(GameEngine.snapshotCell(cellToProcess))
			}
		})
		return { unflaggedCells, revealedCells }
	}

	private determineStatus(resultState: FieldState) {
		const revealedCount = resultState.revealedCells.length
		const totalCells = resultState.field
			.flat()
			.filter((cell): cell is CellData => cell !== null).length
		const safeCells = totalCells - resultState.minedCells.length

		if (resultState.explodedCells.length > 0) return 'lost'
		else if (revealedCount === safeCells) return 'won'
		else return 'playing'
	}

	private getFlagsRemaining(resultState: FieldState) {
		return resultState.minedCells.length - resultState.flaggedCells.length
	}

	private static snapshotCell(cell: CellData | Cell): CellData {
		if (cell instanceof Cell) return cell.toData()
		return Cell.createCell(cell).toData()
	}

	/**
	 * Gets the current complete game state snapshot.
	 * @returns GameSnapshot containing field state and current game status
	 */
	get gameSnapshot(): GameSnapshot {
		if (!this.field) return GameEngine.emptySnapshot(this.status)
		return Object.assign(this.field.getFieldSnapshot(), {
			status: this.status,
		})
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
		const target = Cell.createCell({ position: pos }).toData()
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
