/**
 * Remove scratch roots left behind by runs that are gone (a crash or `kill -9` skips the
 * normal exit-time cleanup).
 *
 * A live run holds a liveness socket in its root (`@cldmv/lib-process` `alive`), so a pid is
 * never trusted: inside a PID namespace every outside run's pid looks dead, and pids repeat
 * across namespaces. A root whose socket refuses connections is removed at once. A root with
 * no socket (a run still starting, a path too long for a Unix socket, Windows) is removed
 * only once it has gone unmodified for {@link STALE_ROOT_AGE_MS}; live runs refresh it every
 * {@link HEARTBEAT_MS}. Roots named the pre-1.7 way (`<pid>-<timestamp>`) are removed by age
 * alone, after {@link STALE_LEGACY_ROOT_AGE_MS}.
 *
 * @param {string} cwd - Project root.
 * @param {string} scratchDir - Scratch base directory, relative to `cwd` (or absolute).
 * @returns {Promise<void>}
 */
export function sweepStaleScratchRoots(cwd: string, scratchDir: string): Promise<void>;
/**
 * A run's scratch root and the liveness hold on it.
 *
 * @typedef {Object} RunScratchRoot
 * @property {string} root - The root's path.
 * @property {() => Promise<void>} release - Stops holding the root (socket and heartbeat). Idempotent.
 */
/**
 * Create this run's scratch root, `<cwd>/<scratchDir>/<16 hex>/`, and hold it: a liveness
 * socket other runs' sweepers can check, plus a heartbeat that keeps its modification time
 * fresh for when there's no socket. Both stop when the process exits, however it exits.
 *
 * @param {string} cwd - Project root.
 * @param {string} scratchDir - Scratch base directory, relative to `cwd` (or absolute).
 * @returns {Promise<RunScratchRoot>}
 */
export function createRunScratchRoot(cwd: string, scratchDir: string): Promise<RunScratchRoot>;
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
/**
 * How long a run root with no liveness socket may go unmodified before it counts as stale.
 * A live run touches its root every {@link HEARTBEAT_MS}, so only a run that's gone ages past this.
 */
export const STALE_ROOT_AGE_MS: number;
/** Legacy `<pid>-<timestamp>` roots never had a heartbeat, so they get a day. */
export const STALE_LEGACY_ROOT_AGE_MS: number;
/** How often a live run refreshes its root's modification time. */
export const HEARTBEAT_MS: number;
/**
 * A run's scratch root and the liveness hold on it.
 */
export type RunScratchRoot = {
    /**
     * - The root's path.
     */
    root: string;
    /**
     * - Stops holding the root (socket and heartbeat). Idempotent.
     */
    release: () => Promise<void>;
};
