import { createKey } from '../../src/lib/utils'
import { SquareGeometry } from '../../src/model/geometry/Square'
import type { FieldGeometry, GameParams, Position } from '../../src/model/types'

export const createRestrictedGeometry = (
	params: GameParams,
	allowed: Position[],
): FieldGeometry => {
	const base = new SquareGeometry(params)
	const allowedSet = new Set(allowed.map(createKey))

	const isInBoundary = (pos: Position) => allowedSet.has(createKey(pos))

	return {
		isInBoundary,
		getSiblings: (pos: Position) => {
			if (!isInBoundary(pos)) return []
			return base.getSiblings(pos).filter(isInBoundary)
		},
		getAllPositions: () => [...allowed],
	}
}
