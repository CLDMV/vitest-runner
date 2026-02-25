/**
 * @fileoverview Package-bin and vitest-config resolution helpers.
 * @module vitest-runner/src/utils/resolve
 */

import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";

/**
 * Resolve the absolute path of a binary shipped with an npm package.
 *
 * The `require` instance is rooted at `cwd` so the package is found in the
 * consumer project's `node_modules`, not the runner's own.
 *
 * @param {string} cwd - Consumer project root to search from.
 * @param {string} pkgName - The npm package name (e.g. `'vitest'`).
 * @param {string} [binName=pkgName] - The bin alias key to look up.
 * @returns {string} Absolute path to the binary entry point.
 * @throws {Error} When the bin entry is not found in the package manifest.
 * @example
 * resolveBin('/my/project', 'vitest');
 * // '/my/project/node_modules/vitest/dist/cli.mjs'
 */
export function resolveBin(cwd, pkgName, binName = pkgName) {
	const require = createRequire(pathToFileURL(path.join(cwd, "package.json")));
	const pkgJsonPath = require.resolve(`${pkgName}/package.json`);
	const pkg = require(pkgJsonPath);

	const rel = pkg.bin?.[binName] ?? pkg.bin;
	if (!rel) throw new Error(`No bin "${binName}" found in ${pkgName}/package.json`);

	return path.join(path.dirname(pkgJsonPath), rel);
}

/**
 * Ordered list of default vitest / vite config file names.
 * The search walks this list in declaration order, relative to `cwd`.
 * @type {readonly string[]}
 */
const DEFAULT_CONFIG_NAMES = Object.freeze([
	"vitest.config.ts",
	"vitest.config.mts",
	"vitest.config.cts",
	"vitest.config.mjs",
	"vitest.config.js",
	"vitest.config.cjs",
	"vite.config.ts",
	"vite.config.mts",
	"vite.config.mjs",
	"vite.config.js"
]);

/**
 * Resolve the vitest config path to use for a project.
 *
 * - If `configPath` is provided it is returned as-is (resolved absolute if relative).
 * - Otherwise the function walks {@link DEFAULT_CONFIG_NAMES} relative to `cwd`
 *   and returns the first file that exists.
 * - Returns `undefined` when nothing is found, letting vitest use its own defaults.
 *
 * @param {string} cwd - Project root directory.
 * @param {string|undefined} configPath - Explicit config path, or `undefined` for auto-detect.
 * @returns {Promise<string|undefined>} Resolved absolute config path, or `undefined`.
 * @example
 * const cfg = await resolveVitestConfig('/my/project', undefined);
 * // '/my/project/vitest.config.ts'  (if that file exists)
 */
export async function resolveVitestConfig(cwd, configPath) {
	if (configPath) {
		return path.isAbsolute(configPath) ? configPath : path.resolve(cwd, configPath);
	}

	for (const name of DEFAULT_CONFIG_NAMES) {
		const candidate = path.join(cwd, name);
		try {
			await fs.access(candidate);
			return candidate;
		} catch {
			// not found — try next
		}
	}

	return undefined;
}
