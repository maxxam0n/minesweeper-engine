import { createKey } from '../lib/utils'
import {
	assertValidGameParams,
	InvalidGameParamsError,
} from '../lib/validate-params'
import type { CreateFieldAnalyzer } from '../model/analyzer.types'
import type { GameEngineChangeListener } from '../model/engine-events.types'
import { Cell } from '../model/Cell'
import { Field } from '../model/Field'
import { GeometryFactory } from '../model/geometry/Factory'
import type {
	ActionResult,
	CellData,
	FieldGeometry,
	FieldState,
	FieldType,
	GameMode,
	GameParams,
	GameSnapshot,
	GameStatus,
	MineSweeperConfig,
	PersistedGameState,
	Position,
} from '../model/types'
import {
	PERSISTED_GAME_VERSION,
} from '../model/types'

import { Solver } from './field-solver'

export { InvalidGameParamsError }

type HistoryEntry = {
	field: Field
	status: GameStatus
	flagsRemaining: number
}

const DEFAULT_MAX_HISTORY = 100

const defaultCreateAnalyzer: CreateFieldAnalyzer = field => new Solver(field)

/**
 * Main game engine for managing minesweeper game state and actions.
 * Handles cell revelation, flagging, game status, and mode-specific logic.
 */
export class GameEngine {
	private mode: GameMode
	private field: Field
	private params: GameParams
	private status: GameStatus
	private flagsRemaining: number

	private readonly geometry: FieldGeometry
	private readonly fieldType?: FieldType
	private readonly rng?: () => number
	private readonly createAnalyzer: CreateFieldAnalyzer
	private readonly maxHistory: number
	private history: HistoryEntry[] = []
	private readonly changeListeners = new Set<GameEngineChangeListener>()

	/**
	 * Creates a new game engine instance.
	 * @param config - Game configuration including field type, parameters, and optional mode
	 * @throws {InvalidGameParamsError} If rows/cols/mines fail validation
	 */
	constructor(config: MineSweeperConfig) {
		const {
			mode = 'guessing',
			createAnalyzer = defaultCreateAnalyzer,
			maxHistory = DEFAULT_MAX_HISTORY,
			...fieldConfig
		} = config

		this.mode = mode
		this.params = fieldConfig.params
		this.status = 'idle'
		this.createAnalyzer = createAnalyzer
		this.maxHistory = Math.max(0, maxHistory)
		this.rng = fieldConfig.rng
		this.fieldType = 'type' in config ? config.type : undefined

		assertValidGameParams(this.params)

		this.geometry =
			'geometry' in config && config.geometry
				? config.geometry
				: GeometryFactory.create({
						type: config.type!,
						params: this.params,
					})

		this.field = new Field({
			params: fieldConfig.params,
			data: fieldConfig.data,
			rng: fieldConfig.rng,
			geometry: this.geometry,
		})
		this.flagsRemaining = this.field.getFieldSnapshot().minedCells.length
	}

	get canUndo(): boolean {
		return this.history.length > 0
	}

	/**
	 * Подписка на изменения после `apply` / `undo`.
	 * @returns функция отписки
	 */
	public onChange(listener: GameEngineChangeListener): () => void {
		this.changeListeners.add(listener)
		return () => {
			this.changeListeners.delete(listener)
		}
	}

	/**
	 * Откатывает последний применённый ход (`apply`).
	 * @returns `true`, если откат выполнен
	 */
	public undo(): boolean {
		const previous = this.history.pop()
		if (!previous) return false

		const previousStatus = this.status
		this.field = previous.field
		this.status = previous.status
		this.flagsRemaining = previous.flagsRemaining
		this.emitChange('undo', previousStatus)
		return true
	}

	/**
	 * Сериализует текущее состояние партии (поле + статус + params).
	 * RNG и custom geometry в снимок не входят.
	 */
	public serialize(): PersistedGameState {
		return {
			version: PERSISTED_GAME_VERSION,
			params: this.params,
			mode: this.mode,
			status: this.status,
			...(this.fieldType ? { type: this.fieldType } : {}),
			field: this.field.getFieldSnapshot().field,
		}
	}

	/**
	 * Восстанавливает движок из сериализованного состояния.
	 * Для партий с custom geometry передайте `geometry` в options.
	 */
	public static fromPersistedState(
		state: PersistedGameState,
		options?: {
			geometry?: FieldGeometry
			rng?: () => number
			createAnalyzer?: CreateFieldAnalyzer
			maxHistory?: number
		},
	): GameEngine {
		if (state.version !== PERSISTED_GAME_VERSION) {
			throw new Error(
				`Unsupported persisted game version: ${String(state.version)}`,
			)
		}

		assertValidGameParams(state.params)

		const geometry =
			options?.geometry ??
			(state.type
				? GeometryFactory.create({ type: state.type, params: state.params })
				: undefined)

		if (!geometry) {
			throw new Error(
				'Persisted state has no field type; pass options.geometry to restore.',
			)
		}

		const engine = state.type
			? new GameEngine({
					type: state.type,
					params: state.params,
					mode: state.mode,
					data: state.field,
					rng: options?.rng,
					createAnalyzer: options?.createAnalyzer,
					maxHistory: options?.maxHistory,
				})
			: new GameEngine({
					geometry,
					params: state.params,
					mode: state.mode,
					data: state.field,
					rng: options?.rng,
					createAnalyzer: options?.createAnalyzer,
					maxHistory: options?.maxHistory,
				})

		engine.status = state.status
		engine.flagsRemaining = engine.getFlagsRemaining(
			engine.field.getFieldSnapshot(),
		)
		engine.history = []
		return engine
	}

	/**
	 * Reveals a cell at the specified position.
	 * On the first click, if the cell is mined, relocates that mine to another empty cell
	 * (`relocateMine`) so the click is safe without regenerating the whole field.
	 * In 'no-guessing' mode, prevents revealing cells when solver detects uncertain states.
	 * Supports chord clicking (clicking on revealed cells to reveal adjacent safe cells).
	 */
	public revealCell(pos: Position): ActionResult {
		let actionStatus: GameStatus = this.status
		const operatedField = this.field.cloneSelf()

		const flaggedCells: CellData[] = []
		const unflaggedCells: CellData[] = []
		const revealedCells: CellData[] = []
		const handledCells: CellData[] = []
		const explodedCells: CellData[] = []

		if (actionStatus === 'idle') {
			if (operatedField.cloneCell(pos)?.isMine) {
				const unminedCell = operatedField.grid
					.flat()
					.find(cell => cell && !cell.isMine)
				if (!unminedCell) {
					actionStatus = 'lost'
				} else {
					operatedField.relocateMine(pos, unminedCell.position)
					actionStatus = 'playing'
				}
			} else {
				actionStatus = 'playing'
			}
		}

		const target = operatedField.getCell(pos)
		if (!target) {
			return GameEngine.emptyActionResult(pos)
		}

		if (actionStatus === 'playing' && !target.isFlagged) {
			if (target.isMine) {
				const handleLoss = () => {
					target.isRevealed = true
					const targetSnapshot = GameEngine.snapshotCell(target)
					handledCells.push(targetSnapshot)
					explodedCells.push(targetSnapshot)
				}

				if (this.mode === 'no-guessing') {
					const analyzer = this.createAnalyzer(operatedField)
					const probabilities = analyzer.solve()

					if (analyzer.isGuessingState(probabilities)) {
						if (
							probabilities.some(
								p =>
									p.value === 1 &&
									createKey(p.position) === target.key,
							)
						) {
							handleLoss()
						} else {
							return this.toggleFlag(pos)
						}
					} else {
						handleLoss()
					}
				} else {
					handleLoss()
				}
			} else if (target.isRevealed) {
				const result = this.handleRevealedClick(target, operatedField)
				revealedCells.push(...result.revealedCells)
				unflaggedCells.push(...result.unflaggedCells)
				explodedCells.push(...result.explodedCells)
				handledCells.push(...result.handledCells)
			} else {
				const result = this.openArea(pos, operatedField)
				revealedCells.push(...result.revealedCells)
				unflaggedCells.push(...result.unflaggedCells)
				handledCells.push(GameEngine.snapshotCell(target))
			}
		}

		const resultState = operatedField.getFieldSnapshot()
		actionStatus = this.determineStatus(resultState)
		const targetSnapshot = GameEngine.snapshotCell(target)

		return {
			data: {
				actionSnapshot: { ...resultState, status: actionStatus },
				actionChanges: {
					target: targetSnapshot,
					explodedCells,
					flaggedCells,
					revealedCells,
					handledCells,
					unflaggedCells,
				},
			},
			apply: () => {
				this.commit(operatedField, actionStatus, resultState)
			},
		}
	}

	/**
	 * Toggles the flag state of a cell at the specified position.
	 * Only works on unrevealed cells during active gameplay.
	 */
	public toggleFlag(pos: Position): ActionResult {
		const operatedField = this.field.cloneSelf()

		const flaggedCells: CellData[] = []
		const unflaggedCells: CellData[] = []

		const cell = operatedField.getCell(pos)
		if (!cell) return GameEngine.emptyActionResult(pos)

		if (this.status === 'playing' && !cell.isRevealed) {
			if (cell.isFlagged) {
				cell.isFlagged = false
				unflaggedCells.push(GameEngine.snapshotCell(cell))
			} else if (this.flagsRemaining > 0) {
				cell.isFlagged = true
				flaggedCells.push(GameEngine.snapshotCell(cell))
			}
		}

		const resultState = operatedField.getFieldSnapshot()
		const targetSnapshot = GameEngine.snapshotCell(cell)

		return {
			data: {
				actionSnapshot: { ...resultState, status: this.status },
				actionChanges: {
					explodedCells: [],
					flaggedCells,
					unflaggedCells,
					handledCells: [],
					revealedCells: [],
					target: targetSnapshot,
				},
			},
			apply: () => {
				this.commit(operatedField, this.status, resultState)
			},
		}
	}

	private commit(
		operatedField: Field,
		status: GameStatus,
		resultState: FieldState,
	): void {
		const previousStatus = this.status
		this.pushHistory()
		this.status = status
		this.field = operatedField
		this.flagsRemaining = this.getFlagsRemaining(resultState)
		this.emitChange('apply', previousStatus)
	}

	private emitChange(
		reason: 'apply' | 'undo',
		previousStatus: GameStatus,
	): void {
		if (this.changeListeners.size === 0) return
		const event = {
			reason,
			snapshot: this.gameSnapshot,
			previousStatus,
		}
		for (const listener of this.changeListeners) {
			listener(event)
		}
	}

	private pushHistory(): void {
		if (this.maxHistory === 0) return

		this.history.push({
			field: this.field.cloneSelf(),
			status: this.status,
			flagsRemaining: this.flagsRemaining,
		})

		if (this.history.length > this.maxHistory) {
			this.history.shift()
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

		if (flags === targetCell.adjacentMines) {
			const handledTargets = [...closedSiblings]

			for (const sibCell of siblings) {
				if (sibCell.isFlagged || sibCell.isRevealed) continue

				if (sibCell.isMine && !sibCell.isFlagged) {
					sibCell.isRevealed = true
					explodedCells.push(GameEngine.snapshotCell(sibCell))
				} else {
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

	get gameSnapshot(): GameSnapshot {
		return { ...this.field.getFieldSnapshot(), status: this.status }
	}

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
