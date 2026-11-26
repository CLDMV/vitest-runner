/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /src/core/heartbeat-reporter.mjs
 *	@Date: 2026-11-25T18:51:59-08:00 (1795661519)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-25T19:39:18-08:00 (1795664358)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * @fileoverview Vitest reporter that tells the runner a file is still making progress.
 *
 * Coverage runs use the default and blob reporters. With stdout not a TTY, the default
 * reporter prints nothing until the file finishes, so a long file looks idle to the
 * per-file idle watchdog (see core/watchdog.mjs). The runner adds this reporter and
 * passes it a pipe as file descriptor `VITEST_RUNNER_HEARTBEAT_FD`. Every reporter event
 * writes one newline to it, at most once per `HEARTBEAT_INTERVAL_MS`, and the runner
 * resets the idle timer on each one. Without the env var it does nothing.
 *
 * Built to dist/core/ next to core/spawn.mjs, which finds it by a relative URL.
 * @module vitest-runner/src/core/heartbeat-reporter
 */

import fs from "node:fs";

/** Env var naming the file descriptor the heartbeat is written to. */
export const HEARTBEAT_FD_ENV = "VITEST_RUNNER_HEARTBEAT_FD";

/** Minimum gap between two heartbeats, in ms. */
export const HEARTBEAT_INTERVAL_MS = 1000;

/** Reporter events that mean the file is still doing work. */
const EVENTS = [
	"onTestRunStart",
	"onTestModuleQueued",
	"onTestModuleCollected",
	"onTestModuleStart",
	"onTestModuleEnd",
	"onHookStart",
	"onHookEnd",
	"onTestSuiteReady",
	"onTestSuiteResult",
	"onTestCaseReady",
	"onTestCaseResult",
	"onTestCaseAnnotate",
	"onUserConsoleLog",
	"onCoverage",
	"onTaskUpdate"
];

/**
 * Writes a heartbeat to the runner's pipe on reporter events.
 * @example
 * // vitest run --reporter=default --reporter=/abs/path/heartbeat-reporter.mjs
 */
export default class HeartbeatReporter {
	/**
	 * Vitest passes the reporter's options (unused) as the first argument.
	 * @param {unknown} [_options]
	 * @param {{ env?: NodeJS.ProcessEnv, now?: () => number }} [deps] - Overrides for tests.
	 */
	constructor(_options, { env = process.env, now = Date.now } = {}) {
		const fd = Number.parseInt(env[HEARTBEAT_FD_ENV] ?? "", 10);
		this.fd = Number.isInteger(fd) && fd > 2 ? fd : undefined;
		this.now = now;
		this.last = -Infinity;
		for (const event of EVENTS) this[event] = () => this.beat();
	}

	/**
	 * Write one heartbeat unless one went out within the interval.
	 * @returns {void}
	 */
	beat() {
		if (this.fd === undefined) return;
		const now = this.now();
		if (now - this.last < HEARTBEAT_INTERVAL_MS) return;
		this.last = now;
		// The runner may have closed its end (the file was killed); nothing to do then.
		fs.write(this.fd, "\n", () => {});
	}
}
