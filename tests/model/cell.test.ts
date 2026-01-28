import { describe, expect, it } from 'vitest'
import { Cell } from '../../src/model/Cell'

describe('Cell.createCell', () => {
	it('derives flags for mines and reveals', () => {
		const mine = Cell.createCell({
			position: { row: 0, col: 0 },
			isMine: true,
			isRevealed: true,
		})

		expect(mine.isExploded).toBe(true)
		expect(mine.notFoundMine).toBe(true)
		expect(mine.isEmpty).toBe(false)
		expect(mine.isUntouched).toBe(false)
	})

	it('derives flags for missed mines and untouched cells', () => {
		const missed = Cell.createCell({
			position: { row: 0, col: 1 },
			isFlagged: true,
			adjacentMines: 2,
		})

		const untouched = Cell.createCell({
			position: { row: 0, col: 2 },
		})

		expect(missed.isMissed).toBe(true)
		expect(missed.isEmpty).toBe(false)
		expect(untouched.isUntouched).toBe(true)
		expect(untouched.isEmpty).toBe(true)
	})
})
