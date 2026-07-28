import { parseKey } from '../../lib/utils'
import type { MineProbability, Position } from '../../model/types'

export class ProbabilityStore {
	private probabilities = new Map<string, MineProbability>()

	public clear(): void {
		this.probabilities.clear()
	}

	public getAll(): MineProbability[] {
		return Array.from(this.probabilities.values())
	}

	public has(key: string): boolean {
		return this.probabilities.has(key)
	}

	public get(key: string): MineProbability | undefined {
		return this.probabilities.get(key)
	}

	public setExact(key: string, value: 0 | 1, position: Position): boolean {
		const existing = this.probabilities.get(key)
		if (existing?.value === 0 || existing?.value === 1) return false

		this.probabilities.set(key, { value, position })
		return true
	}

	public setProbability(key: string, value: number): boolean {
		const existing = this.probabilities.get(key)
		if (existing) {
			if (existing.value === 0 || existing.value === 1) return false
			if (value === 0 || value === 1 || value < existing.value) {
				this.probabilities.set(key, { position: parseKey(key), value })
				return true
			}
			return false
		}
		this.probabilities.set(key, { position: parseKey(key), value })
		return true
	}
}
