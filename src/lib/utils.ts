import { Position } from '../model/types'

export const createGrid = <T>(
	rows: number,
	cols: number,
	cb: ({ row, col }: Position) => T
) => {
	return Array.from({ length: rows }, (_, row) =>
		Array.from({ length: cols }, (_, col) => cb({ row, col }))
	)
}

export const isSubset = (subA: Set<string>, subB: Set<string>): boolean => {
	for (const item of subA) {
		if (!subB.has(item)) return false
	}
	return true
}

export const difference = (a: Set<string>, b: Set<string>): Set<string> => {
	return new Set([...a].filter(x => !b.has(x)))
}

export const createKey = ({ col, row }: Position) => {
	return `${col}-${row}`
}

export const parseKey = (key: string): Position => {
	const [col, row] = key.split('-').map(Number)
	return { col, row }
}
