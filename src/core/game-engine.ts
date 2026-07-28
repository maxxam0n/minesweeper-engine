import {
	assertValidGameParams,
	InvalidGameParamsError,
} from '../lib/validate-params'
import {
	assertValidFieldGeometry,
	InvalidFieldGeometryError,
} from '../lib/validate-field-geometry'
import { getRandomIndex } from '../lib/random'
import { createKey } from '../lib/utils'
import {
	InvalidPersistedGameStateError,
	validateFieldGrid,
	validatePersistedGameState,
} from '../lib/validate-persisted-state'
import type { GameEngineChangeListener } from '../model/engine-events.types'
import { Cell } from '../model/Cell'
import { Field } from '../model/Field'
import type {
	ActionResult,
	CellData,
	FieldGeometry,
	FieldState,
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
import {
	ActionAlreadyAppliedError,
	InvalidMaxHistoryError,
	StaleActionError,
} from './game-engine.errors'

export {
	ActionAlreadyAppliedError,
	InvalidFieldGeometryError,
	InvalidGameParamsError,
	InvalidMaxHistoryError,
	InvalidPersistedGameStateError,
	StaleActionError,
}

type HistoryEntry = {
	field: Field
	fieldState: FieldState
	status: GameStatus
	flagsRemaining: number
}

const DEFAULT_MAX_HISTORY = 100

const assertValidMaxHistory: (
	value: unknown,
) => asserts value is number = value => {
	if (
		typeof value !== 'number' ||
		!Number.isSafeInteger(value) ||
		value < 0
	) {
		throw new InvalidMaxHistoryError(value)
	}
}

/**
 * Main game engine for managing minesweeper game state and actions.
 * Handles cell revelation, flagging, game status, and first-click relocate.
 * Solvable layouts are produced separately via `generateSolvableBoard`.
 */
export class GameEngine {
	private field: Field
	private fieldState: FieldState
	private readonly params: GameParams
	private status: GameStatus
	private flagsRemaining: number
	private revision = 0

	private readonly geometry: FieldGeometry
	private readonly maxHistory: number
	private readonly cellCount: number
	private history: HistoryEntry[] = []
	private readonly changeListeners = new Set<GameEngineChangeListener>()

	/**
	 * @param config - Обязательны `geometry` и `params`
	 * @throws {InvalidGameParamsError} при невалидных params
	 */
	constructor(config: MineSweeperConfig) {
		const {
			maxHistory = DEFAULT_MAX_HISTORY,
			geometry,
			...fieldConfig
		} = config

		this.params = { ...fieldConfig.params }
		this.status = 'idle'
		this.geometry = geometry

		assertValidGameParams(this.params)
		assertValidMaxHistory(maxHistory)
		assertValidFieldGeometry(this.geometry, this.params)
		this.maxHistory = maxHistory
		const fieldData =
			fieldConfig.data === undefined
				? undefined
				: validateFieldGrid(
						fieldConfig.data,
						this.params,
						this.geometry,
					)

		this.field = new Field({
			params: this.params,
			data: fieldData,
			rng: fieldConfig.rng,
			geometry: this.geometry,
		})
		this.fieldState = this.field.getFieldSnapshot()
		this.cellCount = this.fieldState.field.reduce(
			(total, row) => total + row.filter(cell => cell !== null).length,
			0,
		)
		this.status = this.determineInitialStatus(this.fieldState)
		this.flagsRemaining = this.getFlagsRemaining(this.fieldState)
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
		this.fieldState = previous.fieldState
		this.status = previous.status
		this.flagsRemaining = previous.flagsRemaining
		this.revision++
		this.emitChange('undo', previousStatus)
		return true
	}

	/**
	 * Сериализует текущее состояние партии (поле + статус + params).
	 * Geometry в снимок не входит — при restore передайте её в options.
	 */
	public serialize(): PersistedGameState {
		return {
			version: PERSISTED_GAME_VERSION,
			params: { ...this.params },
			status: this.status,
			field: this.field.cloneGrid(),
		}
	}

	/**
	 * Восстанавливает движок из сериализованного состояния.
	 * Передайте `options.geometry` (для legacy-снимков с `type` geometry
	 * может быть восстановлена через GeometryFactory).
	 */
	public static fromPersistedState(
		state: unknown,
		options?: {
			geometry?: FieldGeometry
			rng?: () => number
			maxHistory?: number
		},
	): GameEngine {
		const validated = validatePersistedGameState(state, options?.geometry)
		const persistedState = validated.state

		const engine = new GameEngine({
			geometry: validated.geometry,
			params: persistedState.params,
			data: persistedState.field,
			rng: options?.rng,
			maxHistory: options?.maxHistory,
		})

		engine.status = persistedState.status
		engine.flagsRemaining = engine.getFlagsRemaining(engine.fieldState)
		engine.history = []
		return engine
	}

	/**
	 * Reveals a cell at the specified position.
	 * On the first click, ensures a zero-opening at the click (relocates mines from
	 * the cell and its neighbors outside the protected zone), then reveals the area.
	 * Supports chord clicking.
	 */
	public revealCell(pos: Position): ActionResult {
		const actionRevision = this.revision
		if (!this.field.getCell(pos) || this.isTerminal) {
			return this.createNoOpActionResult(pos, actionRevision)
		}

		let actionStatus: GameStatus = this.status
		const operatedField = this.field.forkForMutation(this.fieldState)

		const flaggedCells: CellData[] = []
		const unflaggedCells: CellData[] = []
		const revealedCells: CellData[] = []
		const handledCells: CellData[] = []
		const explodedCells: CellData[] = []

		let openingFailed = false
		if (actionStatus === 'idle') {
			if (!GameEngine.ensureFirstClickOpening(operatedField, pos)) {
				openingFailed = true
				actionStatus = 'lost'
			} else {
				actionStatus = 'playing'
			}
		}

		let target = operatedField.getCell(pos)
		if (!target) return this.createNoOpActionResult(pos, actionRevision)

		if (actionStatus === 'playing' && !target.isFlagged) {
			if (target.isMine) {
				target =
					operatedField.setCellRevealed(target.position, true) ?? target
				const targetSnapshot = GameEngine.snapshotCell(target)
				handledCells.push(targetSnapshot)
				explodedCells.push(targetSnapshot)
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
				target = operatedField.getCell(pos) ?? target
				handledCells.push(GameEngine.snapshotCell(target))
			}
		}

		const resultState = operatedField.getFieldSnapshot()
		// Failed opening уже 'lost'; determineStatus иначе вернул бы 'playing'
		actionStatus = openingFailed
			? 'lost'
			: this.determineStatus(resultState)
		target = operatedField.getCell(pos) ?? target
		const targetSnapshot = GameEngine.snapshotCell(target)

		const data: ActionResult['data'] = {
			actionSnapshot: { ...resultState, status: actionStatus },
			actionChanges: {
				target: targetSnapshot,
				explodedCells,
				flaggedCells,
				revealedCells,
				handledCells,
				unflaggedCells,
			},
		}
		const hasChanges =
			resultState !== this.fieldState || actionStatus !== this.status

		return this.createActionResult(
			data,
			actionRevision,
			hasChanges
				? () => {
						this.commit(operatedField, actionStatus, resultState)
					}
				: undefined,
		)
	}

	/**
	 * Гарантирует opening на первом клике: стартовая клетка становится `isEmpty`
	 * за счёт relocate мин с неё и её соседей за пределы защищённой зоны.
	 * @returns `false`, если некуда перенести мины
	 */
	private static ensureFirstClickOpening(
		field: Field,
		startPos: Position,
	): boolean {
		if (!field.getCell(startPos)) return false

		const protectedKeys = new Set<string>([
			createKey(startPos),
			...field.getSiblings(startPos).map(sibling => sibling.key),
		])

		const relocateOut = (from: Position): boolean => {
			const destination = GameEngine.findRelocateDestination(
				field,
				protectedKeys,
				from,
			)
			if (!destination) return false
			field.relocateMine(from, destination)
			return true
		}

		if (field.getCell(startPos)?.isMine && !relocateOut(startPos)) return false

		const maxRelocations = protectedKeys.size + 1
		for (let i = 0; i < maxRelocations; i++) {
			if (field.getCell(startPos)?.isEmpty) break
			const minedNeighbor = field
				.getSiblings(startPos)
				.find(sibling => sibling.isMine)
			if (!minedNeighbor) break
			if (!relocateOut(minedNeighbor.position)) return false
		}

		return field.getCell(startPos)?.isEmpty ?? false
	}

	/**
	 * Цель для переноса мины: случайная безопасная клетка вне защищённой зоны старта.
	 */
	private static findRelocateDestination(
		field: Field,
		protectedKeys: Set<string>,
		from: Position,
	): Position | null {
		const fromKey = createKey(from)
		const candidates: Position[] = []
		for (const cell of field.grid.flat()) {
			if (!cell || cell.isMine) continue
			if (protectedKeys.has(cell.key) || cell.key === fromKey) continue
			candidates.push(cell.position)
		}
		if (candidates.length === 0) return null
		const idx = getRandomIndex(candidates.length, field.rng)
		return candidates[idx] ?? null
	}

	/**
	 * Toggles the flag state of a cell at the specified position.
	 * Only works on unrevealed cells during active gameplay.
	 */
	public toggleFlag(pos: Position): ActionResult {
		const actionRevision = this.revision
		if (!this.field.getCell(pos) || this.status !== 'playing') {
			return this.createNoOpActionResult(pos, actionRevision)
		}

		const operatedField = this.field.forkForMutation(this.fieldState)

		const flaggedCells: CellData[] = []
		const unflaggedCells: CellData[] = []

		let cell = operatedField.getCell(pos)
		if (!cell) return this.createNoOpActionResult(pos, actionRevision)

		if (this.status === 'playing' && !cell.isRevealed) {
			if (cell.isFlagged) {
				cell =
					operatedField.setCellFlagged(cell.position, false) ?? cell
				unflaggedCells.push(GameEngine.snapshotCell(cell))
			} else if (this.flagsRemaining > 0) {
				cell =
					operatedField.setCellFlagged(cell.position, true) ?? cell
				flaggedCells.push(GameEngine.snapshotCell(cell))
			}
		}

		const resultState = operatedField.getFieldSnapshot()
		const targetSnapshot = GameEngine.snapshotCell(cell)

		const data: ActionResult['data'] = {
			actionSnapshot: { ...resultState, status: this.status },
			actionChanges: {
				explodedCells: [],
				flaggedCells,
				unflaggedCells,
				handledCells: [],
				revealedCells: [],
				target: targetSnapshot,
			},
		}

		return this.createActionResult(
			data,
			actionRevision,
			resultState !== this.fieldState
				? () => {
						this.commit(operatedField, this.status, resultState)
					}
				: undefined,
		)
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
		this.fieldState = resultState
		this.flagsRemaining = this.getFlagsRemaining(resultState)
		this.revision++
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
			field: this.field,
			fieldState: this.fieldState,
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

			for (const sibling of siblings) {
				const sibCell = operatedField.getCell(sibling.position)
				if (!sibCell) continue
				if (sibCell.isFlagged || sibCell.isRevealed) continue

				if (sibCell.isMine && !sibCell.isFlagged) {
					const revealedCell = operatedField.setCellRevealed(
						sibCell.position,
						true,
					)
					if (revealedCell) {
						explodedCells.push(GameEngine.snapshotCell(revealedCell))
					}
				} else {
					const openResult = this.openArea(sibCell.position, operatedField)
					revealedCells.push(...openResult.revealedCells)
					unflaggedCells.push(...openResult.unflaggedCells)
				}
			}

			handledCells.push(
				...handledTargets.map(cell =>
					GameEngine.snapshotCell(
						operatedField.getCell(cell.position) ?? cell,
					),
				),
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
			let changedCell = cellToProcess
			if (wasFlagged) {
				changedCell =
					operatedField.setCellFlagged(cellToProcess.position, false) ??
					changedCell
				unflaggedCells.push(GameEngine.snapshotCell(changedCell))
			}
			if (!wasRevealed) {
				changedCell =
					operatedField.setCellRevealed(cellToProcess.position, true) ??
					changedCell
				revealedCells.push(GameEngine.snapshotCell(changedCell))
			}
		})
		return { unflaggedCells, revealedCells }
	}

	private determineStatus(resultState: FieldState) {
		const revealedCount = resultState.revealedCells.length
		const safeCells = this.cellCount - resultState.minedCells.length

		if (resultState.explodedCells.length > 0) return 'lost'
		else if (revealedCount === safeCells) return 'won'
		else return 'playing'
	}

	private determineInitialStatus(resultState: FieldState): GameStatus {
		if (resultState.explodedCells.length > 0) return 'lost'

		const safeCells = this.cellCount - resultState.minedCells.length
		if (resultState.revealedCells.length === safeCells) return 'won'
		if (
			resultState.revealedCells.length > 0 ||
			resultState.flaggedCells.length > 0
		) {
			return 'playing'
		}
		return 'idle'
	}

	private get isTerminal(): boolean {
		return this.status === 'won' || this.status === 'lost'
	}

	private getFlagsRemaining(resultState: FieldState) {
		return resultState.minedCells.length - resultState.flaggedCells.length
	}

	private createActionResult(
		data: ActionResult['data'],
		actionRevision: number,
		applyChanges?: () => void,
	): ActionResult {
		let wasApplied = false

		return {
			data,
			apply: () => {
				if (wasApplied) throw new ActionAlreadyAppliedError()
				if (this.revision !== actionRevision) {
					throw new StaleActionError(actionRevision, this.revision)
				}

				wasApplied = true
				applyChanges?.()
			},
		}
	}

	private createNoOpActionResult(
		pos: Position,
		actionRevision: number,
	): ActionResult {
		return this.createActionResult(
			GameEngine.createEmptyActionData(
				pos,
				this.gameSnapshot,
				this.field.getCell(pos) ?? undefined,
			),
			actionRevision,
		)
	}

	private static snapshotCell(cell: CellData | Cell): CellData {
		if (cell instanceof Cell) return cell.toData()
		return Cell.createCell(cell).toData()
	}

	get gameSnapshot(): GameSnapshot {
		return { ...this.fieldState, status: this.status }
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
		let wasApplied = false
		return {
			data: GameEngine.createEmptyActionData(
				pos,
				GameEngine.emptySnapshot('idle'),
			),
			apply: () => {
				if (wasApplied) throw new ActionAlreadyAppliedError()
				wasApplied = true
			},
		}
	}

	private static createEmptyActionData(
		pos: Position,
		actionSnapshot: GameSnapshot,
		targetCell?: CellData | Cell,
	): ActionResult['data'] {
		const target = targetCell
			? GameEngine.snapshotCell(targetCell)
			: Cell.createCell({ position: pos }).toData()
		return {
			actionSnapshot,
			actionChanges: {
				target,
				handledCells: [],
				flaggedCells: [],
				unflaggedCells: [],
				revealedCells: [],
				explodedCells: [],
			},
		}
	}
}
