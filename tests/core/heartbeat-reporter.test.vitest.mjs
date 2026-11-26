/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/core/heartbeat-reporter.test.vitest.mjs
 *	@Date: 2026-11-25T18:53:10-08:00 (1795661590)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-25T18:53:21-08:00 (1795661601)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * @fileoverview Unit tests for the heartbeat reporter (core/heartbeat-reporter.mjs).
 */
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import HeartbeatReporter, { HEARTBEAT_FD_ENV, HEARTBEAT_INTERVAL_MS } from "../../src/core/heartbeat-reporter.mjs";
import { HEARTBEAT_REPORTER_PATH } from "../../src/core/spawn.mjs";

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WORK = path.join(PKG_ROOT, "tmp", `heartbeat-tests-${process.pid}`);

afterEach(async () => {
	await fsp.rm(WORK, { recursive: true, force: true });
});

/** Wait until the reporter's async writes have landed. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 50));

describe("HeartbeatReporter", () => {
	it("writes at most one heartbeat per interval", async () => {
		await fsp.mkdir(WORK, { recursive: true });
		const file = path.join(WORK, "beats");
		const fd = fs.openSync(file, "w");
		try {
			let now = 0;
			const reporter = new HeartbeatReporter({}, { env: { [HEARTBEAT_FD_ENV]: String(fd) }, now: () => now });
			reporter.onTestModuleStart();
			reporter.onTestCaseResult();
			now = HEARTBEAT_INTERVAL_MS - 1;
			reporter.onHookEnd();
			now = HEARTBEAT_INTERVAL_MS;
			reporter.onTaskUpdate();
			await flush();
			expect(fs.readFileSync(file, "utf8")).toBe("\n\n");
		} finally {
			fs.closeSync(fd);
		}
	});

	it("does nothing without a usable descriptor", () => {
		for (const value of [undefined, "", "abc", "1", "2"]) {
			const reporter = new HeartbeatReporter(undefined, { env: value === undefined ? {} : { [HEARTBEAT_FD_ENV]: value } });
			expect(reporter.fd).toBeUndefined();
			expect(() => reporter.onTestCaseResult()).not.toThrow();
		}
	});

	it("ignores a write that fails", async () => {
		// No process has this many descriptors open, so the write fails with EBADF.
		const reporter = new HeartbeatReporter(undefined, { env: { [HEARTBEAT_FD_ENV]: "65000" } });
		expect(() => reporter.onTestCaseResult()).not.toThrow();
		await flush();
	});

	it("reads process.env by default", () => {
		const saved = process.env[HEARTBEAT_FD_ENV];
		process.env[HEARTBEAT_FD_ENV] = "7";
		try {
			expect(new HeartbeatReporter().fd).toBe(7);
		} finally {
			if (saved === undefined) delete process.env[HEARTBEAT_FD_ENV];
			else process.env[HEARTBEAT_FD_ENV] = saved;
		}
	});

	it("is the file runSingleFile hands to vitest", () => {
		expect(HEARTBEAT_REPORTER_PATH).toBe(path.join(PKG_ROOT, "src", "core", "heartbeat-reporter.mjs"));
		expect(fs.existsSync(HEARTBEAT_REPORTER_PATH)).toBe(true);
	});
});
