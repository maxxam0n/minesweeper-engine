import { log } from 'node:console'
import { access } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const packageRoot = resolve(
	fileURLToPath(new URL('.', import.meta.url)),
	'..',
)
const require = createRequire(import.meta.url)

const runtimeEntries = [
	{
		path: 'dist/minesweeper-engine.es.js',
		format: 'import',
		expectedExport: 'MinesweeperEngine',
	},
	{
		path: 'dist/minesweeper-engine.cjs',
		format: 'require',
		expectedExport: 'MinesweeperEngine',
	},
	{
		path: 'dist/solver.es.js',
		format: 'import',
		expectedExport: 'MinesweeperSolver',
	},
	{
		path: 'dist/solver.cjs',
		format: 'require',
		expectedExport: 'MinesweeperSolver',
	},
	{
		path: 'dist/geometry.es.js',
		format: 'import',
		expectedExport: 'GeometryFactory',
	},
	{
		path: 'dist/geometry.cjs',
		format: 'require',
		expectedExport: 'GeometryFactory',
	},
]

const declarationEntries = [
	'dist/index.d.ts',
	'dist/solver.d.ts',
	'dist/geometry.d.ts',
]

/**
 * @param {{ path: string, format: string, expectedExport: string }} entry
 */
const checkRuntimeEntry = async entry => {
	const absolutePath = resolve(packageRoot, entry.path)
	await access(absolutePath)

	const loaded =
		entry.format === 'import'
			? await import(pathToFileURL(absolutePath).href)
			: require(absolutePath)

	if (!(entry.expectedExport in loaded)) {
		throw new Error(
			`${entry.path} does not export ${entry.expectedExport}`,
		)
	}
}

await Promise.all([
	...runtimeEntries.map(checkRuntimeEntry),
	...declarationEntries.map(path => access(resolve(packageRoot, path))),
])

log('Package entry points are loadable and declaration files are present.')
