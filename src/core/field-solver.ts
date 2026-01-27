import { createKey, difference, isSubset, parseKey } from '../lib/utils'
import type { BaseField } from '../model/base-field'
import { FieldFactory } from '../model/field-factory'
import type { SimpleCell } from '../model/simple-cell'
import type { CellData, FactoryConfig, MineProbability } from '../model/types'

type Constraint = {
	cell: CellData
	neighbors: string[] // ключи соседних закрытых ячеек
	mines: number // цифра на клетке
}

type Subset = {
	key: string
	positions: Set<string>
	mineCount: number
}

interface RegionConstraint {
	indices: number[]
	mines: number
}

const MAX_FULL_ENUM_VARS = 18 // полный перебор выполняем, если переменных не более этого значения
const MAX_LOOKAHEAD_VARS = 30 // shallow look-ahead применяем, если переменных не более этого значения

/**
 * Solver for calculating mine probabilities and determining safe moves.
 * Uses constraint satisfaction, set theory, and enumeration techniques
 * to identify cells that are definitely safe or definitely mines.
 */
export class Solver {
	private field: BaseField<SimpleCell>
	private probabilities: Map<string, MineProbability>

	// Кэш результатов полного перебора: key -> { total, counts }
	private static enumerationCache: Map<string, { total: number; counts: number[] }> = new Map()

	/**
	 * Creates a new solver instance for the given field configuration.
	 * @param config - Field configuration including parameters, type, and optional data
	 */
	constructor(config: FactoryConfig) {
		this.probabilities = new Map()
		this.field = FieldFactory.create(config)
	}

	/**
	 * Determines if the current state requires guessing.
	 * A guessing state exists when all calculated probabilities are greater than 0
	 * (no cells are definitively safe).
	 * @param probabilities - Array of mine probabilities for cells
	 * @returns True if guessing is required, false if there are safe moves available
	 */
	public isGuessingState(probabilities: MineProbability[]): boolean {
		for (const prob of probabilities) {
			if (prob.value === 0) {
				return false
			}
		}
		return true
	}

	/**
	 * Groups revealed cells into connected regions based on adjacency.
	 * Useful for analyzing independent constraint groups.
	 * @returns Array of cell arrays, where each array represents a connected region
	 */
	public createConnectedRegions(): CellData[][] {
		const fieldState = this.field.getState()
		return this.groupConnectedRegions(fieldState.revealedCells)
	}

	/**
	 * Solves the field by calculating mine probabilities for all unrevealed cells.
	 * Uses multiple inference techniques in order:
	 * 1. Direct constraint inference (certain mines/safe cells)
	 * 2. Subset difference analysis
	 * 3. Set theory constraints
	 * 4. Local ratio approximations (when deterministic methods are exhausted)
	 * @returns Array of mine probabilities for all cells with calculated probabilities
	 */
	public solve(): MineProbability[] {
		const fieldState = this.field.getState()
		// Очищаем вероятности перед новым решением (на случай повторного вызова)
		this.probabilities.clear()

		let updated: boolean
		do {
			updated =
				this.inferCertainMines(fieldState.revealedCells) ||
				this.inferCertainSafeCells(fieldState.revealedCells)

			if (updated) continue

			updated = this.inferBySubsetDifference(fieldState.revealedCells)

			if (updated) continue

			updated = this.inferBySetTheory(fieldState.revealedCells)
		} while (updated)

		// После исчерпания детерминированных методов — приблизительные вероятности
		this.inferByLocalRatios(fieldState.revealedCells)

		return Array.from(this.probabilities.values())
	}

	// Определяет клетки со стопроцентной вероятностью нахождения мины по правилу:
	// Если на открытой клетке цифра равна количеству количеству закрытых клеток с не нулевой вероятностью,
	// То все они - мины
	private inferCertainMines(cells: CellData[]): boolean {
		let updated = false

		for (const cell of cells) {
			if (cell.isEmpty || cell.isMine) continue

			const siblings = this.field.getSiblings(cell.position)
			const closed = siblings.filter(s => !s.isRevealed)

			if (closed.length === 0) continue

			const knownSafe = closed.filter(
				s => this.probabilities.get(createKey(s.position))?.value === 0,
			)

			if (cell.adjacentMines === closed.length - knownSafe.length) {
				for (const sib of closed) {
					const key = createKey(sib.position)
					if (this.probabilities.has(key)) continue
					this.probabilities.set(key, { value: 1, position: sib.position })
					updated = true
				}
			}
		}

		return updated
	}

	// Находит безопасные закрытые клетки на основе простого правила:
	// Если на открытой клетке цифра равна количеству стопроцентных вероятностей на соседних закрытых клетах,
	// То остальные закрытые клетки - безопасны
	private inferCertainSafeCells(cells: CellData[]): boolean {
		let updated = false

		for (const cell of cells) {
			if (cell.isEmpty || cell.isMine) continue

			const siblings = this.field.getSiblings(cell.position)
			const closed = siblings.filter(s => !s.isRevealed)

			if (closed.length === 0) continue

			const knownMines = closed.filter(
				s => this.probabilities.get(createKey(s.position))?.value === 1,
			)

			if (knownMines.length === cell.adjacentMines) {
				for (const sib of closed) {
					const key = createKey(sib.position)
					if (this.probabilities.has(key)) continue
					this.probabilities.set(key, { value: 0, position: sib.position })
					updated = true
				}
			}
		}

		return updated
	}

	private inferBySubsetDifference(cells: CellData[]): boolean {
		let updated = false

		const subsets: Subset[] = []

		for (const cell of cells) {
			if (cell.isEmpty || cell.isMine) continue

			const siblings = this.field.getSiblings(cell.position)
			const closedSiblings = siblings.filter(sib => !sib.isRevealed)

			if (closedSiblings.length === 0) continue

			const minesUnknown = closedSiblings.filter(
				s => this.probabilities.get(createKey(s.position))?.value === 1,
			)

			const minesLeft = cell.adjacentMines - minesUnknown.length

			const subsetPositions = closedSiblings
				.filter(s => !minesUnknown.includes(s))
				.map(s => createKey(s.position))

			if (subsetPositions.length === 0 || minesLeft <= 0) continue

			subsets.push({
				key: createKey(cell.position),
				positions: new Set(subsetPositions),
				mineCount: minesLeft,
			})
		}

		// Перебираем все пары подмножеств
		for (let i = 0; i < subsets.length; i++) {
			for (let j = i + 1; j < subsets.length; j++) {
				const a = subsets[i]
				const b = subsets[j]

				const intersection = new Set([...a.positions].filter(p => b.positions.has(p)))
				if (intersection.size === 0) continue

				// A ⊆ B
				if (isSubset(a.positions, b.positions)) {
					const diff = difference(b.positions, a.positions)
					const diffMineCount = b.mineCount - a.mineCount

					if (diffMineCount === 0) {
						diff.forEach(pos => {
							if (this.probabilities.has(pos)) return
							updated = true
							this.probabilities.set(pos, {
								value: 0,
								position: parseKey(pos),
							})
						})
					} else if (diffMineCount === diff.size) {
						diff.forEach(pos => {
							if (this.probabilities.has(pos)) return
							updated = true
							this.probabilities.set(pos, {
								value: 1,
								position: parseKey(pos),
							})
						})
					}
				}
				// B ⊆ A (обратное включение)
				else if (isSubset(b.positions, a.positions)) {
					const diff = difference(a.positions, b.positions)
					const diffMineCount = a.mineCount - b.mineCount

					if (diffMineCount === 0) {
						diff.forEach(pos => {
							if (this.probabilities.has(pos)) return
							updated = true
							this.probabilities.set(pos, {
								value: 0,
								position: parseKey(pos),
							})
						})
					} else if (diffMineCount === diff.size) {
						diff.forEach(pos => {
							if (this.probabilities.has(pos)) return
							updated = true
							this.probabilities.set(pos, {
								value: 1,
								position: parseKey(pos),
							})
						})
					}
				}
			}
		}

		return updated
	}

	// Рассчитывает не абсолютные (0 или 1) вероятности
	private inferByLocalRatios(cells: CellData[]) {
		for (const cell of cells) {
			if (cell.isEmpty || cell.isMine) continue

			const siblings = this.field.getSiblings(cell.position)
			const closed = siblings.filter(s => !s.isRevealed)

			if (closed.length === 0) continue

			const knownMines = closed.filter(
				s => this.probabilities.get(createKey(s.position))?.value === 1,
			)

			const unknown = closed.filter(s => !knownMines.includes(s))

			if (unknown.length === 0) continue

			const remainingMines = cell.adjacentMines - knownMines.length
			const prob = remainingMines / unknown.length

			for (const sib of unknown) {
				const key = createKey(sib.position)
				if (this.probabilities.has(key)) continue
				this.probabilities.set(key, { value: prob, position: sib.position })
			}
		}
	}

	private inferBySetTheory(cells: CellData[]): boolean {
		let updated = false

		const regions = this.groupConnectedRegions(cells)

		for (const region of regions) {
			const constraints: Constraint[] = []
			const variables = new Set<string>()

			for (const cell of region) {
				const siblings = this.field.getSiblings(cell.position)
				const closedSiblings = siblings.filter(s => !s.isRevealed)

				const variableKeys = closedSiblings.map(s => createKey(s.position))
				variableKeys.forEach(key => variables.add(key))

				constraints.push({
					cell,
					neighbors: variableKeys,
					mines: cell.adjacentMines,
				})
			}

			const variableList = Array.from(variables)
			const subregions = this.splitIntoSubregions(variableList, constraints)

			for (const { vars, cons } of subregions) {
				if (vars.length <= MAX_FULL_ENUM_VARS) {
					// Полный перебор с точными вероятностями
					const { counts, total } = this.enumerateRegion(vars, cons)
					if (total === 0) continue

					for (let i = 0; i < vars.length; i++) {
						const key = vars[i]
						const probValue = counts[i] / total
						if (this.setProbability(key, probValue)) {
							updated = true
						}
					}
				} else if (vars.length <= MAX_LOOKAHEAD_VARS) {
					// Shallow look-ahead: проверяем каждую переменную отдельно
					if (this.processByLookAhead(vars, cons)) {
						updated = true
					}
				}
			}
		}

		return updated
	}

	// Helper to update probability map in a single place
	private setProbability(key: string, value: number): boolean {
		const existing = this.probabilities.get(key)
		if (existing) {
			// Если уже есть точное значение 0/1 — не затираем
			if (existing.value === 0 || existing.value === 1) return false
			// Обновляем, если новое значение точнее (0/1) или меньше существующей вероятности
			if (value === 0 || value === 1 || value < existing.value) {
				this.probabilities.set(key, { position: parseKey(key), value })
				return true
			}
			return false
		}
		this.probabilities.set(key, { position: parseKey(key), value })
		return true
	}

	/**
	 * Перебирает все валидные расстановки мин для региона, используя рекурсивный DFS
	 * с отсечениями: если в каком-то уравнении мин уже больше, чем нужно, либо
	 * оставшихся неизвестных не хватит, ветка отбрасывается.
	 * Возвращает: сколько раз каждая переменная оказалась миной и общее кол-во
	 * валидных конфигураций.
	 */
	private enumerateRegion(
		variableList: string[],
		constraints: Constraint[],
	): { counts: number[]; total: number } {
		const canonicalVars = [...variableList].sort()
		const canonIndex = new Map<string, number>()
		canonicalVars.forEach((v, i) => canonIndex.set(v, i))

		const canonicalConstraints: RegionConstraint[] = constraints.map(c => ({
			indices: c.neighbors.map(n => canonIndex.get(n)!),
			mines: c.mines,
		}))

		const key = this.createConstraintsKey(canonicalVars.length, canonicalConstraints)

		let cached = Solver.enumerationCache.get(key)
		if (!cached) {
			cached = this.bruteForce(canonicalVars.length, canonicalConstraints)
			Solver.enumerationCache.set(key, cached)
		}

		// Перемаппинг результата к исходному порядку переменных
		const counts = new Array<number>(variableList.length).fill(0)
		for (let i = 0; i < variableList.length; i++) {
			const ci = canonIndex.get(variableList[i])!
			counts[i] = cached.counts[ci]
		}

		return { counts, total: cached.total }
	}

	private createConstraintsKey(varCount: number, constraints: RegionConstraint[]): string {
		const parts = constraints.map(rc => {
			const idx = [...rc.indices].sort((a, b) => a - b).join(',')
			return `${rc.mines}:${idx}`
		})
		parts.sort()
		return `${varCount}|${parts.join(';')}`
	}

	private bruteForce(
		varCount: number,
		constraints: RegionConstraint[],
	): { counts: number[]; total: number } {
		const mineInConstraint = new Array<number>(constraints.length).fill(0)
		const unknownInConstraint = constraints.map(rc => rc.indices.length)
		const consForVar: number[][] = Array.from({ length: varCount }, () => [])
		constraints.forEach((rc, ci) => {
			rc.indices.forEach(idx => consForVar[idx].push(ci))
		})

		const counts = new Array<number>(varCount).fill(0)
		let totalValid = 0
		const assignment: boolean[] = new Array(varCount)

		const dfs = (idx: number) => {
			if (idx === varCount) {
				totalValid++
				for (let i = 0; i < varCount; i++) if (assignment[i]) counts[i]++
				return
			}
			// safe = false
			let pruned = false
			for (const ci of consForVar[idx]) {
				unknownInConstraint[ci]--
				if (
					mineInConstraint[ci] > constraints[ci].mines ||
					mineInConstraint[ci] + unknownInConstraint[ci] < constraints[ci].mines
				) {
					pruned = true
				}
			}
			if (!pruned) {
				assignment[idx] = false
				dfs(idx + 1)
			}
			for (const ci of consForVar[idx]) unknownInConstraint[ci]++

			// mine = true
			pruned = false
			for (const ci of consForVar[idx]) {
				mineInConstraint[ci]++
				unknownInConstraint[ci]--
				if (
					mineInConstraint[ci] > constraints[ci].mines ||
					mineInConstraint[ci] + unknownInConstraint[ci] < constraints[ci].mines
				) {
					pruned = true
				}
			}
			if (!pruned) {
				assignment[idx] = true
				dfs(idx + 1)
			}
			for (const ci of consForVar[idx]) {
				mineInConstraint[ci]--
				unknownInConstraint[ci]++
			}
		}
		dfs(0)
		return { counts, total: totalValid }
	}

	// Определяем список групп (регионов), каждая из которых включает все открытые клетки, которые:
	// 1. находятся рядом друг с другом
	// 2. делят хотя бы одну общую закрытую клетку
	private groupConnectedRegions(cells: CellData[]): CellData[][] {
		const visited = new Set<string>()
		const regions: CellData[][] = []

		for (const cell of cells) {
			const key = createKey(cell.position)
			if (visited.has(key)) continue

			// Пропускаем "мёртвые" открытые клетки (не имеющие закрытых соседей)
			const siblings = this.field.getSiblings(cell.position)
			const hasClosed = siblings.some(s => !s.isRevealed)

			if (!hasClosed) continue

			const group: CellData[] = []
			const queue: CellData[] = [cell]

			while (queue.length > 0) {
				const current = queue.pop()!
				const currentKey = createKey(current.position)
				if (visited.has(currentKey)) continue

				visited.add(currentKey)
				group.push(current)

				const neighbors = this.field
					.getSiblings(current.position)
					.filter(n => n.isRevealed && !visited.has(createKey(n.position)))

				for (const neighbor of neighbors) {
					const nSiblings = this.field.getSiblings(neighbor.position)
					const nHasClosed = nSiblings.some(s => !s.isRevealed)
					if (nHasClosed) {
						queue.push(neighbor)
					}
				}
			}

			if (group.length > 0) {
				regions.push(group)
			}
		}

		return regions
	}

	// Делит набор переменных на независимые компоненты по участию в ограничениях
	private splitIntoSubregions(variableList: string[], constraints: Constraint[]) {
		if (variableList.length === 0) return [] as { vars: string[]; cons: Constraint[] }[]

		const indexOf = new Map<string, number>()
		variableList.forEach((v, i) => indexOf.set(v, i))

		// Строим граф смежности переменных
		const adj: number[][] = variableList.map(() => [])
		for (const c of constraints) {
			const indices = c.neighbors.map(v => indexOf.get(v)!)
			for (let i = 0; i < indices.length; i++) {
				for (let j = i + 1; j < indices.length; j++) {
					const a = indices[i]
					const b = indices[j]
					adj[a].push(b)
					adj[b].push(a)
				}
			}
		}

		const visited = new Array<boolean>(variableList.length).fill(false)
		const components: { vars: string[]; cons: Constraint[] }[] = []

		for (let i = 0; i < variableList.length; i++) {
			if (visited[i]) continue
			const stack = [i]
			const compIdx: number[] = []
			visited[i] = true
			while (stack.length) {
				const v = stack.pop()!
				compIdx.push(v)
				for (const neigh of adj[v]) {
					if (!visited[neigh]) {
						visited[neigh] = true
						stack.push(neigh)
					}
				}
			}

			const vars = compIdx.map(idx => variableList[idx])
			const cons = constraints.filter(c => c.neighbors.some(n => vars.includes(n)))
			components.push({ vars, cons })
		}

		return components
	}

	private processByLookAhead(vars: string[], cons: Constraint[]): boolean {
		let updated = false
		const varCount = vars.length
		const indexOf = new Map<string, number>()
		vars.forEach((v, i) => indexOf.set(v, i))
		const regionCons: RegionConstraint[] = cons.map(c => ({
			indices: c.neighbors.map(n => indexOf.get(n)!),
			mines: c.mines,
		}))

		for (let localIdx = 0; localIdx < varCount; localIdx++) {
			const key = vars[localIdx]
			if (this.probabilities.has(key)) continue

			const canBeSafe = this.hasSolutionForced(localIdx, false, varCount, regionCons)
			const canBeMine = this.hasSolutionForced(localIdx, true, varCount, regionCons)

			if (!canBeSafe && canBeMine) {
				updated = this.setProbability(key, 1) || updated
			} else if (canBeSafe && !canBeMine) {
				updated = this.setProbability(key, 0) || updated
			}
		}
		return updated
	}

	private hasSolutionForced(
		forcedIdx: number,
		forcedValue: boolean,
		varCount: number,
		constraints: RegionConstraint[],
	): boolean {
		// Создаём отображение индексов после удаления переменной
		const map: number[] = []
		let newIdx = 0
		for (let i = 0; i < varCount; i++) {
			if (i === forcedIdx) {
				map[i] = -1
			} else {
				map[i] = newIdx++
			}
		}

		const newCons: RegionConstraint[] = []
		for (const rc of constraints) {
			let mines = rc.mines
			const indices: number[] = []
			for (const idx of rc.indices) {
				if (idx === forcedIdx) {
					if (forcedValue) mines--
				} else {
					indices.push(map[idx])
				}
			}
			// Быстрая проверка противоречий
			if (mines < 0 || mines > indices.length) return false
			newCons.push({ indices, mines })
		}

		// Проверяем кэш. Используем тот же канонический ключ
		const key = this.createConstraintsKey(varCount - 1, newCons)
		const cached = Solver.enumerationCache.get(key)
		if (cached) return cached.total > 0

		// Иначе быстрый перебор до первой конфигурации
		const result = this.bruteForce(varCount - 1, newCons)
		// Не кладём короткие результаты в кэш, чтобы не затереть полный расчёт
		return result.total > 0
	}
}
