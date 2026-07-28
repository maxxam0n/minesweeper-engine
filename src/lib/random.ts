export class InvalidRandomValueError extends RangeError {
	public readonly value: number

	constructor(value: number) {
		super(
			`Invalid RNG value: ${String(value)}. Expected a finite number in the range [0, 1).`,
		)
		this.name = 'InvalidRandomValueError'
		this.value = value
	}
}

export const getRandomIndex = (
	length: number,
	random: () => number,
): number => {
	if (!Number.isSafeInteger(length) || length <= 0) {
		throw new RangeError(
			`Cannot select a random index from a collection of length ${String(length)}.`,
		)
	}

	const value = random()
	if (!Number.isFinite(value) || value < 0 || value >= 1) {
		throw new InvalidRandomValueError(value)
	}

	return Math.floor(value * length)
}
