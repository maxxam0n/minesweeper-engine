import { HexagonalField } from './hexagonal-field'
import { SquareField } from './square-field'
import { TriangularField } from './triangular-field'
import type { FactoryConfig } from './types'

export class FieldFactory {
	static create(config: FactoryConfig) {
		switch (config.type) {
			case 'hexagonal':
				return new HexagonalField(config)
			case 'triangle':
				return new TriangularField(config)
			case 'square':
			default:
				return new SquareField(config)
		}
	}
}
