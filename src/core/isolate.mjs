/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /src/core/isolate.mjs
 *	@Date: 2026-11-21T12:11:37-08:00 (1795291897)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-21T12:14:14-08:00 (1795292054)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * @fileoverview Optional PID-namespace isolation for a whole run.
 * @module vitest-runner/src/core/isolate
 *
 * @description
 * A test's bad `kill` can reach every process the user owns. Inside its own PID namespace a
 * run can only signal its own processes, and when the namespace's first process exits the
 * kernel kills everything left in it. With isolation on, the runner re-runs its own command
 * line under `unshare -U --map-current-user -p -f --mount-proc` and passes the exit code
 * through. When unprivileged namespaces aren't available it fails loudly; it never falls
 * back to running unsandboxed. `-r` (map root) is deliberately not used: it breaks `cp -a`.
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";

/** Environment variable that turns isolation on (`1`) when the `isolate` option isn't set. */
export const ISOLATE_ENV = "CLDMV_TEST_ISOLATE";

/**
 * Inode of the kernel's initial PID namespace (PROC_PID_INIT_INO, 0xEFFFFFFC). A process whose
 * `/proc/self/ns/pid` shows any other inode is already in a PID namespace of its own (a
 * container, a k3s pod, an earlier `unshare -p`).
 */
export const INITIAL_PID_NAMESPACE_INODE = 4026531836;

/** The `unshare` options: new user and PID namespaces, a fresh /proc, and the child killed with unshare. */
export const UNSHARE_ARGS = Object.freeze(["-U", "--map-current-user", "-p", "-f", "--mount-proc", "--kill-child=SIGTERM"]);

/**
 * Whether isolation is on: the `isolate` option when given, otherwise `CLDMV_TEST_ISOLATE=1`.
 *
 * @param {boolean | undefined} option
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @returns {boolean}
 */
export function isolationRequested(option, env = process.env) {
	return option ?? env[ISOLATE_ENV] === "1";
}

/**
 * Whether this process is already in a PID namespace other than the initial one.
 * Unreadable `/proc` counts as "not isolated", so isolation is attempted (and fails loudly
 * if it can't happen) rather than skipped.
 *
 * @param {(path: string) => string} [readlink=fs.readlinkSync]
 * @returns {boolean}
 */
export function inPidNamespace(readlink = fs.readlinkSync) {
	try {
		const match = /^pid:\[(\d+)\]$/.exec(readlink("/proc/self/ns/pid"));
		return match !== null && Number(match[1]) !== INITIAL_PID_NAMESPACE_INODE;
	} catch {
		return false;
	}
}

/**
 * Checks that `unshare` can create the namespaces, by running `true` inside them. Throws with
 * unshare's own message when it can't, so a run that asked for isolation never runs without it.
 *
 * @param {typeof spawnSync} [run=spawnSync]
 * @returns {void}
 */
export function assertUnshareWorks(run = spawnSync) {
	const result = run("unshare", [...UNSHARE_ARGS, "true"], { encoding: "utf8" });
	if (result.error || result.status !== 0) {
		const detail = result.error ? result.error.message : (result.stderr || "").trim() || `exit code ${result.status}`;
		throw new Error(
			`vitest-runner: isolation is on (isolate / ${ISOLATE_ENV}=1) but unprivileged user and PID namespaces aren't available here (${detail}). ` +
				"Run inside a container, enable unprivileged user namespaces, or turn isolation off. The run did not start."
		);
	}
}

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
export function runIsolated({
	start = spawn,
	execPath = process.execPath,
	execArgv = process.execArgv,
	argv = process.argv,
	env = process.env,
	proc = process
} = {}) {
	const child = start("unshare", [...UNSHARE_ARGS, "--", execPath, ...execArgv, ...argv.slice(1)], { stdio: "inherit", env });
	const forward = (/** @type {NodeJS.Signals} */ signal) => child.kill(signal);
	proc.on("SIGINT", forward);
	proc.on("SIGTERM", forward);

	return new Promise((resolve, reject) => {
		const done = () => {
			proc.removeListener("SIGINT", forward);
			proc.removeListener("SIGTERM", forward);
		};
		child.once("error", (error) => {
			done();
			reject(error);
		});
		child.once("exit", (code, signal) => {
			done();
			resolve(code ?? 128 + (os.constants.signals[/** @type {NodeJS.Signals} */ (signal)] ?? 0));
		});
	});
}
