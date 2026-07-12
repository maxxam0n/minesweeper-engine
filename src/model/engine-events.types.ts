import type { GameSnapshot } from './game.types'
import type { GameStatus } from './primitives.types'

export type GameEngineChangeReason = 'apply' | 'undo'

export type GameEngineChangeEvent = {
	reason: GameEngineChangeReason
	snapshot: GameSnapshot
	previousStatus: GameStatus
}

export type GameEngineChangeListener = (event: GameEngineChangeEvent) => void
