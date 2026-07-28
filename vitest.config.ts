import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Vitest на Windows ломает discovery, если cwd/root с lowercase drive letter
 * (`c:\...` vs `C:\...`) — suites не находятся.
 */
const normalizeRoot = (dir: string) => {
	if (process.platform !== 'win32') return dir
	return dir.replace(/^([a-zA-Z]):/, (_, letter: string) => `${letter.toUpperCase()}:`)
}

const root = normalizeRoot(path.dirname(fileURLToPath(import.meta.url)))

export default defineConfig({
	root,
	test: {
		environment: 'node',
		include: ['tests/**/*.test.ts'],
	},
})
