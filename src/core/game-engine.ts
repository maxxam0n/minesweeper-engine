import {
	assertValidGameParams,
	InvalidGameParamsError,
} from '../lib/validate-params'
import { createKey } from '../lib/utils'
import type { GameEngineChangeListener } from '../model/engine-events.types'
import { Cell } from '../model/Cell'
import { Field } from '../model/Field'
import { GeometryFactory } from '../model/geometry/Factory'
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

export { InvalidGameParamsError }

type HistoryEntry = {
	field: Field
	status: GameStatus
	flagsRemaining: number
}

const DEFAULT_MAX_HISTORY = 100

/**
 * Main game engine for managing minesweeper game state and actions.
 * Handles cell revelation, flagging, game status, and first-click relocate.
 * Solvable layouts are produced separately via `generateSolvableBoard`.
 */
export class GameEngine {
	private field: Field
	private params: GameParams
	private status: GameStatus
	private flagsRemaining: number

	private readonly geometry: FieldGeometry
	private readonly rng?: () => number
	private readonly maxHistory: number
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

		this.params = fieldConfig.params
		this.status = 'idle'
		this.maxHistory = Math.max(0, maxHistory)
		this.rng = fieldConfig.rng
		this.geometry = geometry

		assertValidGameParams(this.params)

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
	 * Geometry в снимок не входит — при restore передайте её в options.
	 */
	public serialize(): PersistedGameState {
		return {
			version: PERSISTED_GAME_VERSION,
			params: this.params,
			status: this.status,
			field: this.field.getFieldSnapshot().field,
		}
	}

	/**
	 * Восстанавливает движок из сериализованного состояния.
	 * Передайте `options.geometry` (для legacy-снимков с `type` geometry
	 * может быть восстановлена через GeometryFactory).
	 */
	public static fromPersistedState(
		state: PersistedGameState,
		options?: {
			geometry?: FieldGeometry
			rng?: () => number
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
				'Pass options.geometry to restore a persisted game (geometry is not embedded in the snapshot).',
			)
		}

		const engine = new GameEngine({
			geometry,
			params: state.params,
			data: state.field,
			rng: options?.rng,
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
	 * On the first click, ensures a zero-opening at the click (relocates mines from
	 * the cell and its neighbors outside the protected zone), then reveals the area.
	 * Supports chord clicking.
	 */
	public revealCell(pos: Position): ActionResult {
		let actionStatus: GameStatus = this.status
		const operatedField = this.field.cloneSelf()

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

		const target = operatedField.getCell(pos)
		if (!target) {
			return GameEngine.emptyActionResult(pos)
		}

		if (actionStatus === 'playing' && !target.isFlagged) {
			if (target.isMine) {
				target.isRevealed = true
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
				handledCells.push(GameEngine.snapshotCell(target))
			}
		}

		const resultState = operatedField.getFieldSnapshot()
		// Failed opening уже 'lost'; determineStatus иначе вернул бы 'playing'
		actionStatus = openingFailed
			? 'lost'
			: this.determineStatus(resultState)
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
	 * Гарантирует opening на первом клике: стартовая клетка становится `isEmpty`
	 * за счёт relocate мин с неё и её соседей за пределы защищённой зоны.
	 * @returns `false`, если некуда перенести мины
	 */
	private static ensureFirstClickOpening(
		field: Field,
		startPos: Position,
	): boolean {
		const start = field.getCell(startPos)
		if (!start) return false

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

		if (start.isMine && !relocateOut(startPos)) return false

		const maxRelocations = protectedKeys.size + 1
		for (let i = 0; i < maxRelocations && !start.isEmpty; i++) {
			const minedNeighbor = field
				.getSiblings(startPos)
				.find(sibling => sibling.isMine)
			if (!minedNeighbor) break
			if (!relocateOut(minedNeighbor.position)) return false
		}

		return start.isEmpty
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
		const idx = Math.floor(field.rng() * candidates.length)
		return candidates[idx] ?? null
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
