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
export function resolveBin(cwd: string, pkgName: string, binName?: string): string;
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
export function resolveVitestConfig(cwd: string, configPath: string | undefined): Promise<string | undefined>;
