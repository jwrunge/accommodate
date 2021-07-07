import svelte from 'rollup-plugin-svelte' 
import commonjs from '@rollup/plugin-commonjs' 
import resolve from '@rollup/plugin-node-resolve' 
import livereload from 'rollup-plugin-livereload' 
import { terser } from 'rollup-plugin-terser' 
import sveltePreprocess from 'svelte-preprocess'
import babel from "@rollup/plugin-babel"
import css from 'rollup-plugin-css-only'

const writeFileSync = require('fs').writeFileSync

const prod = !process.env.ROLLUP_WATCH
const babelSettings = {
    babelHelpers: 'runtime',
    extensions: [ '.js', '.mjs', '.html', '.svelte' ],
    plugins: ['@babel/plugin-external-helpers', '@babel/plugin-transform-runtime', '@babel/plugin-proposal-object-rest-spread']
}

export default {
	input: 'src/main.js',
	output: {
		sourcemap: true,
		format: 'iife',
		name: 'app',
		file: 'public/bundle.js'
	},
	plugins: [
		svelte({
			preprocess: sveltePreprocess(),
		}),

		css({
			output: (styles)=> {
				writeFileSync("public/appBundle.css", styles)
			},
		}),

		babel(babelSettings),

		// If you have external dependencies installed from
		// npm, you'll most likely need these plugins. In
		// some cases you'll need additional configuration —
		// consult the documentation for details:
		// https://github.com/rollup/rollup-plugin-commonjs
		resolve({ 
			browser: true,
			dedupe: ['svelte']
		}),
		commonjs(),

		prod && babel(babelSettings),

		//Watch 'public' directory and refresh when not in production
		!prod && livereload({
			watch: "public/",
			verbose: false
		}),

		// If we're building for production (npm run build
		// instead of npm run dev), minify
		prod && terser()
	],
	watch: {
		clearScreen: false
	}
};
