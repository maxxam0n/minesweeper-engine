import type { GameParams } from '../model/types'

export class InvalidGameParamsError extends Error {
	readonly params: GameParams

	constructor(params: GameParams) {
		super(
			`Invalid game params: rows=${params.rows}, cols=${params.cols}, mines=${params.mines}. ` +
				'Expected integer rows/cols ≥ 5 and 0 ≤ mines ≤ floor(rows*cols*0.5).',
		)
		this.name = 'InvalidGameParamsError'
		this.params = params
	}
}

/** Базовая защита движка от невалидных параметров (чтобы не падать и не зависать). */
export const isValidGameParams = (params: GameParams): boolean => {
	const { cols, rows, mines } = params

	if (
		!Number.isFinite(cols) ||
		!Number.isFinite(rows) ||
		!Number.isFinite(mines)
	) {
		return false
	}
	if (
		!Number.isInteger(cols) ||
		!Number.isInteger(rows) ||
		!Number.isInteger(mines)
	) {
		return false
	}

	if (cols < 5) return false
	if (rows < 5) return false
	if (mines < 0) return false

	const cells = cols * rows
	if (cells <= 0) return false
	if (mines > Math.floor(cells * 0.5)) return false

	return true
}

export const assertValidGameParams = (params: GameParams): void => {
	if (!isValidGameParams(params)) {
		throw new InvalidGameParamsError(params)
	}
}
