import { createKey } from './utils'
import type {
	FieldGeometry,
	GameParams,
	Position,
} from '../model/types'

type UnknownRecord = Record<string, unknown>

export class InvalidFieldGeometryError extends Error {
	public constructor(reason: string) {
		super(`Invalid field geometry: ${reason}`)
		this.name = 'InvalidFieldGeometryError'
	}
}

const fail = (reason: string): never => {
	throw new InvalidFieldGeometryError(reason)
}

const isRecord = (value: unknown): value is UnknownRecord =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

const isUnknownArray = (value: unknown): value is unknown[] =>
	Array.isArray(value)

const parsePosition = (
	value: unknown,
	label: string,
	params: GameParams,
): Position => {
	if (!isRecord(value)) return fail(`${label} must be a position object.`)
	const { col, row } = value
	if (
		typeof row !== 'number' ||
		typeof col !== 'number' ||
		!Number.isInteger(row) ||
		!Number.isInteger(col)
	) {
		return fail(`${label} must contain integer row and col coordinates.`)
	}
	if (row < 0 || col < 0 || row >= params.rows || col >= params.cols) {
		return fail(
			`${label} (${String(row)}, ${String(col)}) lies outside game params.`,
		)
	}
	return { row, col }
}

const collectBoundaryPositions = (
	geometry: FieldGeometry,
	params: GameParams,
): Position[] => {
	const positions: Position[] = []
	for (let row = 0; row < params.rows; row++) {
		for (let col = 0; col < params.cols; col++) {
			const position = { row, col }
			if (geometry.isInBoundary(position)) positions.push(position)
		}
	}
	return positions
}

const validateListedPositions = (
	geometry: FieldGeometry,
	params: GameParams,
	boundaryPositions: readonly Position[],
): void => {
	if (!geometry.getAllPositions) return

	const listedValue: unknown = geometry.getAllPositions()
	if (!isUnknownArray(listedValue)) {
		return fail('getAllPositions() must return an array.')
	}

	const listedKeys = new Set<string>()
	for (const [index, value] of listedValue.entries()) {
		const position = parsePosition(
			value,
			`getAllPositions()[${String(index)}]`,
			params,
		)
		const key = createKey(position)
		if (listedKeys.has(key)) {
			fail(`getAllPositions() contains duplicate position ${key}.`)
		}
		if (!geometry.isInBoundary(position)) {
			fail(`getAllPositions() contains out-of-boundary position ${key}.`)
		}
		listedKeys.add(key)
	}

	const boundaryKeys = new Set(boundaryPositions.map(createKey))
	if (
		listedKeys.size !== boundaryKeys.size ||
		[...boundaryKeys].some(key => !listedKeys.has(key))
	) {
		fail('getAllPositions() disagrees with isInBoundary().')
	}
}

const validateSiblings = (
	geometry: FieldGeometry,
	params: GameParams,
	position: Position,
): ReadonlySet<string> => {
	const siblingsValue: unknown = geometry.getSiblings(position)
	if (!isUnknownArray(siblingsValue)) {
		return fail(`getSiblings(${createKey(position)}) must return an array.`)
	}

	const siblingKeys = new Set<string>()
	for (const [index, value] of siblingsValue.entries()) {
		const sibling = parsePosition(
			value,
			`getSiblings(${createKey(position)})[${String(index)}]`,
			params,
		)
		const key = createKey(sibling)
		if (key === createKey(position)) {
			fail(`getSiblings(${createKey(position)}) contains the cell itself.`)
		}
		if (siblingKeys.has(key)) {
			fail(`getSiblings(${createKey(position)}) contains duplicate ${key}.`)
		}
		if (!geometry.isInBoundary(sibling)) {
			fail(
				`getSiblings(${createKey(position)}) contains out-of-boundary ${key}.`,
			)
		}
		siblingKeys.add(key)
	}
	return siblingKeys
}

const validateAdjacencySymmetry = (
	adjacency: ReadonlyMap<string, ReadonlySet<string>>,
): void => {
	for (const [cellKey, siblingKeys] of adjacency) {
		for (const siblingKey of siblingKeys) {
			if (!adjacency.get(siblingKey)?.has(cellKey)) {
				fail(
					`adjacency must be symmetric: ${cellKey} lists ${siblingKey}, ` +
						`but ${siblingKey} does not list ${cellKey}.`,
				)
			}
		}
	}
}

export const assertValidFieldGeometry = (
	geometry: FieldGeometry,
	params: GameParams,
): void => {
	const boundaryPositions = collectBoundaryPositions(geometry, params)
	if (boundaryPositions.length < params.mines) {
		fail(
			`only ${String(boundaryPositions.length)} cells are available for ` +
				`${String(params.mines)} mines.`,
		)
	}

	validateListedPositions(geometry, params, boundaryPositions)
	const adjacency = new Map<string, ReadonlySet<string>>()
	for (const position of boundaryPositions) {
		adjacency.set(
			createKey(position),
			validateSiblings(geometry, params, position),
		)
	}
	validateAdjacencySymmetry(adjacency)
}
