import type { CreateFieldAnalyzer } from '../model/analyzer.types'
import { Field } from '../model/Field'
import type {
	SolvableBoardGenerateConfig,
	SolvableBoardResult,
} from '../model/solvable-board.types'
import type { FieldGeometry, Position } from '../model/types'
import { assertValidFieldGeometry } from '../lib/validate-field-geometry'
import { assertValidGameParams } from '../lib/validate-params'
import { createKey } from '../lib/utils'
import { Solver } from './field-solver'

const DEFAULT_MAX_ATTEMPTS = 500

const defaultCreateAnalyzer: CreateFieldAnalyzer = field => new Solver(field)

const assertValidMaxAttempts = (maxAttempts: number): void => {
	if (!Number.isSafeInteger(maxAttempts) || maxAttempts <= 0) {
		throw new RangeError(
			`maxAttempts must be a positive safe integer; received ${maxAttempts}`,
		)
	}
}

export class SolvableBoardGenerationError extends Error {
	readonly attempts: number

	constructor(message: string, attempts: number) {
		super(message)
		this.name = 'SolvableBoardGenerationError'
		this.attempts = attempts
	}
}

/** Zero opening: start и соседи без мин — иначе первый ход не даёт no-guessing старт. */
const collectProtectedPositions = (
	geometry: FieldGeometry,
	startPos: Position,
): Position[] => [startPos, ...geometry.getSiblings(startPos)]

const countValidCells = (
	geometry: FieldGeometry,
	params: { rows: number; cols: number },
): number => {
	if (geometry.getAllPositions) return geometry.getAllPositions().length

	let count = 0
	for (let row = 0; row < params.rows; row++) {
		for (let col = 0; col < params.cols; col++) {
			if (geometry.isInBoundary({ row, col })) count++
		}
	}
	return count
}

const isBoardWon = (field: Field): boolean => {
	const cells = field.grid.flat().filter(cell => cell !== null)
	return cells.every(cell => cell.isMine || cell.isRevealed)
}

/**
 * Симулирует идеальную игру только certainty-ходами анализатора.
 * Контракт: «решаемо встроенным (или переданным) analyzer», не абстрактным CSP.
 */
const isSolvableFromStart = (
	field: Field,
	startPos: Position,
	createAnalyzer: CreateFieldAnalyzer,
): boolean => {
	const sim = field.cloneSelf()
	const start = sim.getCell(startPos)
	if (!start || start.isMine) return false

	for (const cell of sim.getAreaToReveal(startPos)) {
		cell.isRevealed = true
	}

	const totalCells = sim.grid.flat().filter(cell => cell !== null).length
	const maxSteps = Math.max(totalCells * 2, 1)

	for (let step = 0; step < maxSteps; step++) {
		if (isBoardWon(sim)) return true

		const analyzer = createAnalyzer(sim)
		const probabilities = analyzer.solve()
		const certainSafe = probabilities.filter(p => p.value === 0)

		if (certainSafe.length === 0) return false

		let revealedAny = false
		for (const hint of certainSafe) {
			const cell = sim.getCell(hint.position)
			if (!cell || cell.isRevealed || cell.isMine) continue

			for (const toReveal of sim.getAreaToReveal(hint.position)) {
				if (!toReveal.isRevealed) {
					toReveal.isRevealed = true
					revealedAny = true
				}
			}
		}

		if (!revealedAny) return false
	}

	return isBoardWon(sim)
}

/**
 * Генерирует раскладку, полностью проходимую analyzer'ом с заданного `startPos`
 * без угадывания. Поле возвращается в закрытом виде — передайте `data` в движок.
 */
export const generateSolvableBoard = (
	config: SolvableBoardGenerateConfig,
): SolvableBoardResult => {
	assertValidGameParams(config.params)

	const { startPos, params, geometry } = config
	assertValidFieldGeometry(geometry, params)

	if (!geometry.isInBoundary(startPos)) {
		throw new Error(
			`startPos (${startPos.row}, ${startPos.col}) is outside the field boundary`,
		)
	}

	const maxAttempts = config.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
	assertValidMaxAttempts(maxAttempts)

	const createAnalyzer = config.createAnalyzer ?? defaultCreateAnalyzer
	const protectedPositions = collectProtectedPositions(geometry, startPos)
	const protectedKeys = new Set(protectedPositions.map(createKey))

	const validCells = countValidCells(geometry, params)
	const availableForMines = validCells - protectedKeys.size
	if (params.mines > availableForMines) {
		throw new Error(
			`Cannot place ${params.mines} mines: only ${availableForMines} cells remain after protecting the start opening`,
		)
	}

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		config.onProgress?.({
			attempt,
			maxAttempts,
			phase: 'sample',
		})

		const field = new Field({
			params,
			geometry,
			rng: config.rng,
			excludeFromMines: protectedPositions,
		})

		config.onProgress?.({
			attempt,
			maxAttempts,
			phase: 'simulate',
		})

		if (isSolvableFromStart(field, startPos, createAnalyzer)) {
			return {
				data: field.getFieldSnapshot().field,
				startPos: { ...startPos },
				attempts: attempt,
				params: { ...params },
			}
		}
	}

	throw new SolvableBoardGenerationError(
		`Failed to generate a solvable board within ${maxAttempts} attempts`,
		maxAttempts,
	)
}
