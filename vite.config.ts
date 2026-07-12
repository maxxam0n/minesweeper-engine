import { defineConfig } from 'vite'
import { resolve } from 'path'
import dts from 'vite-plugin-dts'

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
				index: resolve(__dirname, 'src/index.ts'),
				solver: resolve(__dirname, 'src/entries/solver.ts'),
				geometry: resolve(__dirname, 'src/entries/geometry.ts'),
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
