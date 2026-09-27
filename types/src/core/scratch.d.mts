/**
 * Check whether a process is still alive.
 *
 * @param {number} pid
 * @returns {boolean}
 */
export function isPidAlive(pid: number): boolean;
/**
 * Remove scratch roots left behind by runs whose owning process is no longer alive
 * (a crash or `kill -9` skips the normal exit-time cleanup).
 *
 * @param {string} cwd - Project root.
 * @param {string} scratchDir - Scratch base directory, relative to `cwd` (or absolute).
 * @returns {Promise<void>}
 */
export function sweepStaleScratchRoots(cwd: string, scratchDir: string): Promise<void>;
/**
 * Create this run's scratch root: `<cwd>/<scratchDir>/<pid>-<timestamp>/`.
 *
 * @param {string} cwd - Project root.
 * @param {string} scratchDir - Scratch base directory, relative to `cwd` (or absolute).
 * @returns {Promise<string>} Absolute path to the created root.
 */
export function createRunScratchRoot(cwd: string, scratchDir: string): Promise<string>;
/**
 * Create a scratch subdirectory under the run root for one file invocation.
 *
 * @param {string} runRoot - This run's scratch root, from `createRunScratchRoot`.
 * @param {number} index - A unique index for this invocation within the run.
 * @returns {Promise<string>} Absolute path to the created directory.
 */
export function createFileScratchDir(runRoot: string, index: number): Promise<string>;
/**
 * Remove a run's scratch root (async, best-effort).
 *
 * @param {string} root
 * @returns {Promise<void>}
 */
export function removeScratchRoot(root: string): Promise<void>;
/**
 * Remove a run's scratch root synchronously (best-effort) — used from a signal
 * handler right before `process.exit()`, where async cleanup can't be awaited.
 *
 * @param {string} root
 * @returns {void}
 */
export function removeScratchRootSync(root: string): void;
/**
 * Create a fresh, uniquely-named scratch subdirectory for the calling test file.
 *
 * Reads the run's scratch directory from `process.env.VITEST_RUNNER_TMP`, which
 * vitest-runner sets in every spawned child. Call this from a test file to get
 * isolated scratch space per test case without managing your own `mkdtemp` base.
 *
 * @param {string} label - A short, human-readable label used as the directory name prefix.
 * @returns {string} Absolute path to the newly created directory.
 * @throws {Error} When `VITEST_RUNNER_TMP` is not set (not running under vitest-runner).
 * @example
 * import { makeRunTmpDir } from "@cldmv/vitest-runner";
 * const dir = makeRunTmpDir("my-fixture");
 */
export function makeRunTmpDir(label: string): string;
/** Default scratch root, relative to `cwd`. */
export const DEFAULT_SCRATCH_DIR: "tmp/vitest-runner";
