/**
 * Decide the `--fsModuleCachePath` argument for every vitest child.
 *
 * Order of precedence:
 * 1. a `--fsModuleCachePath` passthrough arg — left alone, no arg added;
 * 2. the runner's `fsModuleCachePath` option — `false` adds nothing, a path is used for every child;
 * 3. `fsModuleCachePath` set anywhere in the resolved config (root or any project) — left alone;
 * 4. otherwise, when the cache is on, `<cwd>/node_modules/.vitest-cache`.
 *
 * @param {any} vitestNode - The consumer's `vitest/node` module (needs `parseCLI` and `resolveConfig`).
 * @param {Object} opts
 * @param {string} opts.cwd - Project root.
 * @param {string[]} [opts.args=[]] - Args the workers get after `vitest run` (config + passthrough).
 * @param {string|false} [opts.fsModuleCachePath] - Runner option.
 * @returns {Promise<FsModuleCachePlan>}
 */
export function planFsModuleCache(vitestNode: any, { cwd, args, fsModuleCachePath }: {
    cwd: string;
    args?: string[];
    fsModuleCachePath?: string | false;
}): Promise<FsModuleCachePlan>;
/**
 * Start Vitest once with the workers' args and close it again.
 *
 * Creating the Vitest instance runs its startup lockfile check, which clears a
 * stale fs module cache. No tests run.
 *
 * @param {any} vitestNode - The consumer's `vitest/node` module (needs `parseCLI` and `createVitest`).
 * @param {Object} opts
 * @param {string} opts.cwd
 * @param {string[]} [opts.args=[]] - Args the workers get after `vitest run`.
 * @param {string[]} [opts.cacheArgs=[]] - From {@link planFsModuleCache}.
 * @returns {Promise<void>}
 */
export function warmFsModuleCache(vitestNode: any, { cwd, args, cacheArgs }: {
    cwd: string;
    args?: string[];
    cacheArgs?: string[];
}): Promise<void>;
/**
 * Plan the fs module cache for a run, and optionally do the lockfile check once,
 * in a helper process (fs-cache-helper.mjs).
 *
 * Does nothing on vitest < 5, which has no top-level `fsModuleCachePath`. When
 * the helper fails or times out, the run goes ahead as if this didn't exist:
 * no args are added.
 *
 * @param {Object} opts
 * @param {string} opts.cwd
 * @param {string|undefined} opts.vitestConfig - Absolute vitest config path, if any.
 * @param {string[]} [opts.vitestArgs=[]] - Passthrough args.
 * @param {string|false} [opts.fsModuleCachePath] - Runner option.
 * @param {boolean} [opts.warm=false] - Also do the lockfile check once.
 * @param {string[]} [opts.conditions=[]]
 * @param {string} [opts.nodeEnv='development']
 * @param {number} [opts.timeoutMs=60000] - Kill the helper after this long.
 * @returns {Promise<FsModuleCachePlan & { warmed: boolean, error?: string }>}
 */
export function prepareFsModuleCache({ cwd, vitestConfig, vitestArgs, fsModuleCachePath, warm, conditions, nodeEnv, timeoutMs }: {
    cwd: string;
    vitestConfig: string | undefined;
    vitestArgs?: string[];
    fsModuleCachePath?: string | false;
    warm?: boolean;
    conditions?: string[];
    nodeEnv?: string;
    timeoutMs?: number;
}): Promise<FsModuleCachePlan & {
    warmed: boolean;
    error?: string;
}>;
/** Cache directory, relative to `cwd`, used when nothing else sets one. */
export const DEFAULT_FS_MODULE_CACHE_DIR: "node_modules/.vitest-cache";
export type FsModuleCachePlan = {
    /**
     * - Args to add to every vitest child (`[]` or one `--fsModuleCachePath=…`).
     */
    cacheArgs: string[];
    /**
     * - Whether the root or any project has `fsModuleCache` on.
     */
    cacheEnabled: boolean;
};
