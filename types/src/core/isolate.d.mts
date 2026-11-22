/**
 * The isolation mode: the `isolate` option when given, otherwise `CLDMV_TEST_ISOLATE` (`1` is
 * on, `force` is forced, anything else is off).
 *
 * @param {boolean | "force" | undefined} option
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @returns {boolean | "force"}
 */
export function isolationRequested(option: boolean | "force" | undefined, env?: NodeJS.ProcessEnv): boolean | "force";
/**
 * Reads and removes {@link ISOLATED_ENV}. Once it has been seen, this process counts as the
 * re-run for the rest of its life.
 *
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @returns {boolean} Whether this process is the re-run inside the namespace.
 */
export function consumeIsolatedMarker(env?: NodeJS.ProcessEnv): boolean;
/**
 * Whether run() should re-run itself under unshare for this mode.
 *
 * @param {boolean | "force"} mode - From {@link isolationRequested}.
 * @param {object} [context] - Injection points for tests.
 * @param {NodeJS.ProcessEnv} [context.env=process.env]
 * @param {() => boolean} [context.namespaced=inPidNamespace]
 * @returns {boolean}
 */
export function shouldIsolate(mode: boolean | "force", { env, namespaced }?: {
    env?: NodeJS.ProcessEnv;
    namespaced?: () => boolean;
}): boolean;
/**
 * Whether this process is already in a PID namespace other than the initial one.
 * Unreadable `/proc` counts as "not isolated", so isolation is attempted (and fails loudly
 * if it can't happen) rather than skipped.
 *
 * @param {(path: string) => string} [readlink=fs.readlinkSync]
 * @returns {boolean}
 */
export function inPidNamespace(readlink?: (path: string) => string): boolean;
/**
 * Checks that `unshare` can create the namespaces, by running `true` inside them. Throws with
 * unshare's own message when it can't, so a run that asked for isolation never runs without it.
 *
 * @param {typeof spawnSync} [run=spawnSync]
 * @returns {void}
 */
export function assertUnshareWorks(run?: typeof spawnSync): void;
/**
 * Re-runs this process's own command line inside new user and PID namespaces and resolves
 * with its exit code. The re-run gets {@link ISOLATED_ENV}=1. SIGINT and SIGTERM sent to this
 * process are passed on.
 *
 * @param {object} [context] - Injection points for tests.
 * @param {typeof spawn} [context.start=spawn]
 * @param {string} [context.execPath=process.execPath]
 * @param {string[]} [context.execArgv=process.execArgv]
 * @param {string[]} [context.argv=process.argv]
 * @param {NodeJS.ProcessEnv} [context.env=process.env]
 * @param {NodeJS.Process} [context.proc=process]
 * @returns {Promise<number>} The isolated run's exit code (128 + n when it died from signal n).
 */
export function runIsolated({ start, execPath, execArgv, argv, env, proc }?: {
    start?: typeof spawn;
    execPath?: string;
    execArgv?: string[];
    argv?: string[];
    env?: NodeJS.ProcessEnv;
    proc?: NodeJS.Process;
}): Promise<number>;
/** Environment variable that turns isolation on (`1`, or `force`) when the `isolate` option isn't set. */
export const ISOLATE_ENV: "CLDMV_TEST_ISOLATE";
/**
 * Set in the environment of the re-run process. The runner reads and removes it on its first
 * run() call, so the re-run doesn't start a third copy of itself and the test processes it
 * spawns don't inherit it (a test that runs the runner again still gets its own namespace).
 */
export const ISOLATED_ENV: "VITEST_RUNNER_ISOLATED";
/**
 * Inode of the kernel's initial PID namespace (PROC_PID_INIT_INO, 0xEFFFFFFC). A process whose
 * `/proc/self/ns/pid` shows any other inode is already in a PID namespace of its own (a
 * container, a k3s pod, an earlier `unshare -p`).
 */
export const INITIAL_PID_NAMESPACE_INODE: 4026531836;
/** The `unshare` options: new user and PID namespaces, a fresh /proc, and the child killed with unshare. */
export const UNSHARE_ARGS: readonly string[];
import { spawnSync } from "node:child_process";
import { spawn } from "node:child_process";
