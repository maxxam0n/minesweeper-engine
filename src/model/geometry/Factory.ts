import { HexagonalGeometry } from './Hexagonal'
import { SquareGeometry } from './Square'
import { TriangularGeometry } from './Triangle'
import type { GeometryFactoryConfig } from '../types'

export class GeometryFactory {
	static create(config: GeometryFactoryConfig) {
		const constructor = {
			square: SquareGeometry,
			hexagonal: HexagonalGeometry,
			triangle: TriangularGeometry,
		}[config.type]

		return new constructor(config.params)
	}
}
