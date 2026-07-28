import { describe, expect, it } from 'vitest'
import { GameEngine } from '../../src/core/game-engine'
import { Field } from '../../src/model/Field'
import { GeometryFactory } from '../../src/model/geometry/Factory'
import type {
	FieldGeometry,
	FieldType,
	GameParams,
	GameSnapshot,
	Position,
} from '../../src/model/types'
import { buildGrid } from '../utils/field-builder.utils'

const createRandom = (seed: number): (() => number) => {
	let state = seed >>> 0
	return () => {
		state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
		return state / 0x1_0000_0000
	}
}

const pickPosition = (
	positions: Position[],
	random: () => number,
): Position => {
	const position = positions[Math.floor(random() * positions.length)]
	if (!position) throw new Error('Expected at least one field position')
	return position
}

const rebuildSnapshot = (
	snapshot: GameSnapshot,
	params: GameParams,
	geometry: FieldGeometry,
): GameSnapshot => ({
	...new Field({
		params,
		geometry,
		data: snapshot.field,
	}).getFieldSnapshot(),
	status: snapshot.status,
})

const expectSnapshotMatchesFullRebuild = (
	snapshot: GameSnapshot,
	params: GameParams,
	geometry: FieldGeometry,
	label: string,
): void => {
	expect({ label, snapshot }).toEqual({
		label,
		snapshot: rebuildSnapshot(snapshot, params, geometry),
	})
}

const expectEngineMatchesRestore = (
	engine: GameEngine,
	geometry: FieldGeometry,
	label: string,
): void => {
	const persisted = engine.serialize()
	const restored = GameEngine.fromPersistedState(persisted, {
		geometry,
		maxHistory: 0,
	})
	expect({ label, snapshot: engine.gameSnapshot }).toEqual({
		label,
		snapshot: restored.gameSnapshot,
	})
}

const geometryCases: Array<{ seed: number; type: FieldType }> = [
	{ type: 'square', seed: 0x12_34_56_78 },
	{ type: 'hexagonal', seed: 0x23_45_67_89 },
	{ type: 'triangle', seed: 0x34_56_78_9a },
]

describe('GameEngine incremental state', () => {
	for (const { seed, type } of geometryCases) {
		it(`matches full reconstruction for randomized ${type} actions`, () => {
			const params = { rows: 8, cols: 8, mines: 10 }
			const geometry = GeometryFactory.create({ type, params })
			const positions = geometry.getAllPositions()
			const actionRandom = createRandom(seed ^ 0xa5_a5_a5_a5)
			const engine = new GameEngine({
				params,
				geometry,
				rng: createRandom(seed),
				maxHistory: 8,
			})

			expectEngineMatchesRestore(engine, geometry, `${type}: initial`)

			for (let step = 0; step < 240; step++) {
				const actionRoll = actionRandom()
				const label = `${type}: step ${step}`

				if (actionRoll < 0.2) {
					engine.undo()
					expectEngineMatchesRestore(engine, geometry, `${label}: undo`)
					continue
				}

				const position = pickPosition(positions, actionRandom)
				const action =
					actionRoll < 0.62
						? engine.revealCell(position)
						: engine.toggleFlag(position)

				expectSnapshotMatchesFullRebuild(
					action.data.actionSnapshot,
					params,
					geometry,
					`${label}: proposed`,
				)
				action.apply()
				expect({ label, snapshot: engine.gameSnapshot }).toEqual({
					label,
					snapshot: action.data.actionSnapshot,
				})
				expectEngineMatchesRestore(engine, geometry, `${label}: applied`)
			}
		})
	}

	it('keeps no-op actions value-stable when applied', () => {
		const params = { rows: 5, cols: 5, mines: 1 }
		const geometry = GeometryFactory.create({ type: 'square', params })
		const engine = new GameEngine({
			params,
			geometry,
			data: buildGrid(params, geometry, {
				mines: [{ row: 4, col: 4 }],
			}),
			maxHistory: 1,
		})
		const before = engine.gameSnapshot
		const ignoredFlag = engine.toggleFlag({ row: 0, col: 0 })

		expect(ignoredFlag.data.actionChanges.flaggedCells).toHaveLength(0)
		expect(ignoredFlag.data.actionSnapshot).toEqual(before)
		ignoredFlag.apply()
		expect(engine.gameSnapshot).toEqual(before)
		expect(engine.undo()).toBe(false)
		expect(engine.gameSnapshot).toEqual(before)

		const outsideField = engine.revealCell({ row: -1, col: -1 })
		outsideField.apply()
		expect(engine.gameSnapshot).toEqual(before)
		expect(engine.canUndo).toBe(false)
		expectEngineMatchesRestore(engine, geometry, 'no-op actions')
	})

	it('honors disabled and single-entry history', () => {
		const params = { rows: 5, cols: 5, mines: 3 }
		const geometry = GeometryFactory.create({ type: 'square', params })
		const grid = buildGrid(params, geometry, {
			mines: [
				{ row: 4, col: 2 },
				{ row: 4, col: 3 },
				{ row: 4, col: 4 },
			],
		})
		const createPlayingEngine = (maxHistory: number): GameEngine =>
			GameEngine.fromPersistedState(
				{
					version: 1,
					params,
					status: 'playing',
					field: grid,
				},
				{ geometry, maxHistory },
			)

		const withoutHistory = createPlayingEngine(0)
		withoutHistory.toggleFlag({ row: 0, col: 0 }).apply()
		expect(withoutHistory.canUndo).toBe(false)
		expect(withoutHistory.undo()).toBe(false)
		expect(
			withoutHistory.gameSnapshot.field[0][0]?.isFlagged,
		).toBe(true)
		expectEngineMatchesRestore(withoutHistory, geometry, 'maxHistory=0')

		const singleEntryHistory = createPlayingEngine(1)
		singleEntryHistory.toggleFlag({ row: 0, col: 0 }).apply()
		const afterFirst = singleEntryHistory.gameSnapshot
		singleEntryHistory.toggleFlag({ row: 0, col: 1 }).apply()
		expect(singleEntryHistory.undo()).toBe(true)
		expect(singleEntryHistory.gameSnapshot).toEqual(afterFirst)
		expect(singleEntryHistory.undo()).toBe(false)
		expectEngineMatchesRestore(singleEntryHistory, geometry, 'maxHistory=1')
	})
})
