import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
	plugins: [
		dts({
			tsconfigPath: './tsconfig.app.json',
			insertTypesEntry: true,
			rollupTypes: true,
			entryRoot: 'src',
		}),
	],
	build: {
		lib: {
			entry: {
				index: resolve(projectRoot, 'src/index.ts'),
				solver: resolve(projectRoot, 'src/entries/solver.ts'),
				geometry: resolve(projectRoot, 'src/entries/geometry.ts'),
			},
			formats: ['es', 'cjs'],
			fileName: (format, entryName) => {
				const base = entryName === 'index' ? 'minesweeper-engine' : entryName
				return format === 'es' ? `${base}.es.js` : `${base}.cjs`
			},
		},
		rollupOptions: {
			output: {
				exports: 'named',
			},
		},
	},
})
