import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config([
	{
		ignores: ['dist/**'],
	},
	{
		files: ['**/*.{js,mjs,ts}'],
		extends: [js.configs.recommended, ...tseslint.configs.recommended],
		languageOptions: {
			ecmaVersion: 2020,
		},
	},
])
