import type { FieldGeometry, FieldType, GameParams } from './types'

/**
 * Конфиг редактора поля: встроенный тип или custom geometry.
 */
export type BoardEditorConfig =
	| { type: FieldType; params: GameParams; geometry?: never }
	| { type?: never; params: GameParams; geometry: FieldGeometry }
