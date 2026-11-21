/**
 * Whether isolation is on: the `isolate` option when given, otherwise `CLDMV_TEST_ISOLATE=1`.
 *
 * @param {boolean | undefined} option
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @returns {boolean}
 */
export function isolationRequested(option: boolean | undefined, env?: NodeJS.ProcessEnv): boolean;
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
 * with its exit code. SIGINT and SIGTERM sent to this process are passed on.
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
/** Environment variable that turns isolation on (`1`) when the `isolate` option isn't set. */
export const ISOLATE_ENV: "CLDMV_TEST_ISOLATE";
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
