export class ActionAlreadyAppliedError extends Error {
	public constructor() {
		super('This game action has already been applied.')
		this.name = 'ActionAlreadyAppliedError'
	}
}

export class StaleActionError extends Error {
	public readonly actionRevision: number
	public readonly currentRevision: number

	public constructor(actionRevision: number, currentRevision: number) {
		super(
			`Cannot apply a stale game action created at revision ${String(actionRevision)}; ` +
				`the current revision is ${String(currentRevision)}.`,
		)
		this.name = 'StaleActionError'
		this.actionRevision = actionRevision
		this.currentRevision = currentRevision
	}
}

export class InvalidMaxHistoryError extends RangeError {
	public readonly value: unknown

	public constructor(value: unknown) {
		super(
			`Invalid maxHistory value: ${String(value)}. ` +
				'Expected a non-negative safe integer.',
		)
		this.name = 'InvalidMaxHistoryError'
		this.value = value
	}
}
