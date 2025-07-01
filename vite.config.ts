import { defineConfig } from 'vite'
import { resolve } from 'path'
import dts from 'vite-plugin-dts'

export default defineConfig({
	plugins: [
		dts({
			tsconfigPath: './tsconfig.app.json',
			insertTypesEntry: true,
			rollupTypes: true,
		}),
	],
	build: {
		lib: {
			entry: resolve(__dirname, 'src/index.ts'),
			name: 'minesweeper-engine',
			fileName: format =>
				`minesweeper-engine.${format === 'es' ? 'es.js' : 'umd.cjs'}`,
		},
	},
})
