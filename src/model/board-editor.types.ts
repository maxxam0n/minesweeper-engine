import type { FieldGeometry, GameParams } from './types'

/**
 * Конфиг редактора поля. Geometry обязательна.
 */
export type BoardEditorConfig = {
	params: GameParams
	geometry: FieldGeometry
}
