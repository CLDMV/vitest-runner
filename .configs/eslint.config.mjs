/**
 * @fileoverview ESLint flat configuration for @cldmv/vitest-runner.
 * @module vitest-runner/.configs/eslint.config
 *
 * @description
 * Mirrors the CLDMV @cldmv/slothlet lint setup: `@eslint/js` recommended for
 * JS/MJS/CJS sources (with the `_` / `___` unused-binding escape hatch), plus
 * the JSON, Markdown, and CSS language plugins. Run via `npm run lint`.
 */

import js from "@eslint/js";
import globals from "globals";
import json from "@eslint/json";
import markdown from "@eslint/markdown";
import css from "@eslint/css";
import { defineConfig } from "eslint/config";

export default defineConfig([
	// Global ignores — applies to all configurations
	{
		ignores: [
			"tmp/**",
			"trash/**",
			"node_modules/**",
			"dist/**",
			"build/**",
			".git/**",
			".configs/**",
			".vscode/**",
			"coverage/**",
			"types/**",
			// Untracked local copy of the original monolithic runner — kept for reference, not maintained.
			"reference/**",
			".vitest-coverage-tmp/**",
			".vitest-coverage-blobs/**",
			"*.min.js",
			"*.min.css",
			"**/package-lock.json",
			// Copy file patterns
			"*copy/",
			"*copy (*)/",
			"*copy */",
			"*copy.*",
			"*copy (*).*",
			"*copy *.*",
			// Additional copy patterns for nested directories
			"**/*copy/",
			"**/*copy (*)/",
			"**/*copy */",
			"**/*copy.*",
			"**/*copy (*).*",
			"**/*copy *.*"
		]
	},
	{
		files: ["**/*.{js,mjs,cjs}"],
		plugins: { js },
		extends: ["js/recommended"],
		rules: {
			"no-unused-vars": [
				"error",
				{
					argsIgnorePattern: "^(_|___.*)$",
					caughtErrorsIgnorePattern: "^(_|___.*)$",
					destructuredArrayIgnorePattern: "^(_|___.*)$",
					varsIgnorePattern: "^(_|___.*)$"
				}
			]
		}
	},
	{ files: ["**/*.cjs"], languageOptions: { sourceType: "commonjs" } },
	{ files: ["**/*.{js,mjs,cjs}"], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
	{
		files: ["tests/**/*.{js,mjs,cjs}"],
		languageOptions: {
			globals: {
				beforeAll: true,
				afterAll: true,
				beforeEach: true,
				afterEach: true,
				describe: true,
				it: true,
				expect: true,
				test: true,
				vi: true
			}
		}
	},
	{ files: ["**/*.json"], plugins: { json }, language: "json/json", extends: ["json/recommended"] },
	{ files: ["**/*.jsonc"], plugins: { json }, language: "json/jsonc", extends: ["json/recommended"] },
	{ files: ["**/*.json5"], plugins: { json }, language: "json/json5", extends: ["json/recommended"] },
	{
		files: ["**/*.md"],
		plugins: { markdown },
		language: "markdown/gfm",
		extends: ["markdown/recommended"],
		rules: {
			// GitHub alerts like [!NOTE] / [!WARNING] are valid GFM but trip the label-ref check.
			"markdown/no-missing-label-refs": "off"
		}
	},
	{ files: ["**/*.css"], plugins: { css }, language: "css/css", extends: ["css/recommended"] }
]);
