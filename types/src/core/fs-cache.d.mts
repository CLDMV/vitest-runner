/**
 * Work out the `--fsModuleCachePath` argument for every vitest child.
 *
 * Returns `[]` (leaving vitest's own setting alone) when:
 * - `fsModuleCachePath` is `false`,
 * - the passthrough args already include `--fsModuleCachePath`, or
 * - the vitest config file sets `fsModuleCachePath`.
 *
 * Otherwise points the cache at `fsModuleCachePath` (resolved against `cwd`),
 * or at `<cwd>/node_modules/.vitest-cache` by default.
 *
 * @param {Object} opts
 * @param {string} opts.cwd - Project root.
 * @param {string[]} [opts.vitestArgs=[]] - Vitest passthrough args.
 * @param {string|undefined} [opts.vitestConfig] - Absolute vitest config path.
 * @param {string|false|undefined} [opts.fsModuleCachePath] - Runner option.
 * @returns {Promise<string[]>}
 * @example
 * await resolveFsModuleCacheArgs({ cwd: '/repo/packages/a' });
 * // ['--fsModuleCachePath=/repo/packages/a/node_modules/.vitest-cache']
 */
export function resolveFsModuleCacheArgs({ cwd, vitestArgs, vitestConfig, fsModuleCachePath }: {
    cwd: string;
    vitestArgs?: string[];
    vitestConfig?: string | undefined;
    fsModuleCachePath?: string | false | undefined;
}): Promise<string[]>;
/**
 * Run one short vitest process so the fs module cache matches the lockfile
 * before the parallel workers start.
 *
 * Runs `vitest list --filesOnly <file>`. Vitest's startup does the lockfile
 * check (and clears a stale cache) before it lists anything, and listing with
 * `--filesOnly` doesn't transform test files. The exit code is ignored: a real
 * problem (bad config, missing file) surfaces in the actual test runs.
 *
 * @param {Object} opts
 * @param {string} opts.cwd
 * @param {string} opts.vitestBin
 * @param {string|undefined} opts.vitestConfig
 * @param {string} opts.filePath - A test file to list (keeps the run cheap and non-empty).
 * @param {string[]} [opts.vitestArgs=[]] - Passthrough args; only the cache-related ones are used.
 * @param {string[]} [opts.cacheArgs=[]] - Output of {@link resolveFsModuleCacheArgs}.
 * @param {string[]} [opts.conditions=[]]
 * @param {string} [opts.nodeEnv='development']
 * @returns {Promise<number>} The warm-up process's exit code.
 */
export function warmFsModuleCache({ cwd, vitestBin, vitestConfig, filePath, vitestArgs, cacheArgs, conditions, nodeEnv }: {
    cwd: string;
    vitestBin: string;
    vitestConfig: string | undefined;
    filePath: string;
    vitestArgs?: string[];
    cacheArgs?: string[];
    conditions?: string[];
    nodeEnv?: string;
}): Promise<number>;
/** Cache directory, relative to `cwd`, used when nothing else sets one. */
export const DEFAULT_FS_MODULE_CACHE_DIR: "node_modules/.vitest-cache";
