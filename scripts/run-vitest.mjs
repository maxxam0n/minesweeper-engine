import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * На Windows Vitest 4 не находит suites, если process.cwd() с lowercase
 * drive letter. Нормализуем cwd перед запуском.
 */
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cwd =
	process.platform === 'win32'
		? projectRoot.replace(/^([a-zA-Z]):/, (_, letter) => `${letter.toUpperCase()}:`)
		: projectRoot

const result = spawnSync(
	process.execPath,
	[
		path.join(cwd, 'node_modules', 'vitest', 'vitest.mjs'),
		'run',
		...process.argv.slice(2),
	],
	{
		cwd,
		stdio: 'inherit',
		env: process.env,
	},
)

process.exit(result.status ?? 1)
