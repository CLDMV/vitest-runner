/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/core/isolate.test.vitest.mjs
 *	@Date: 2026-11-21T12:13:25-08:00 (1795292005)
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
 * Unit tests for src/core/isolate.mjs. Nothing here runs unshare: spawn, spawnSync and
 * readlink are injected fakes.
 */
import { EventEmitter } from "node:events";
import { describe, it, expect, vi } from "vitest";
import {
	ISOLATE_ENV,
	INITIAL_PID_NAMESPACE_INODE,
	UNSHARE_ARGS,
	isolationRequested,
	inPidNamespace,
	assertUnshareWorks,
	runIsolated
} from "../../src/core/isolate.mjs";

describe("isolationRequested", () => {
	it("follows the option when it's given", () => {
		expect(isolationRequested(true, {})).toBe(true);
		expect(isolationRequested(false, { [ISOLATE_ENV]: "1" })).toBe(false);
	});

	it("falls back to CLDMV_TEST_ISOLATE=1", () => {
		expect(ISOLATE_ENV).toBe("CLDMV_TEST_ISOLATE");
		expect(isolationRequested(undefined, { [ISOLATE_ENV]: "1" })).toBe(true);
		expect(isolationRequested(undefined, { [ISOLATE_ENV]: "true" })).toBe(false);
		expect(isolationRequested(undefined, {})).toBe(false);
	});
});

describe("inPidNamespace", () => {
	it("is false in the initial PID namespace and true in any other", () => {
		expect(inPidNamespace(() => `pid:[${INITIAL_PID_NAMESPACE_INODE}]`)).toBe(false);
		expect(inPidNamespace(() => "pid:[4026532999]")).toBe(true);
	});

	it("is false when /proc can't be read or says something unexpected", () => {
		expect(
			inPidNamespace(() => {
				throw new Error("ENOENT");
			})
		).toBe(false);
		expect(inPidNamespace(() => "nonsense")).toBe(false);
	});

	it("reads the real /proc by default", () => {
		expect(typeof inPidNamespace()).toBe("boolean");
	});
});

describe("UNSHARE_ARGS", () => {
	it("maps the current user, never root (-r breaks cp -a)", () => {
		expect(UNSHARE_ARGS).toEqual(["-U", "--map-current-user", "-p", "-f", "--mount-proc", "--kill-child=SIGTERM"]);
		expect(UNSHARE_ARGS).not.toContain("-r");
	});
});

describe("assertUnshareWorks", () => {
	it("passes when unshare can run `true` in the namespaces", () => {
		const run = vi.fn(() => ({ status: 0, stderr: "" }));
		expect(() => assertUnshareWorks(run)).not.toThrow();
		expect(run).toHaveBeenCalledWith("unshare", [...UNSHARE_ARGS, "true"], { encoding: "utf8" });
	});

	it("fails loudly with unshare's own message", () => {
		const run = () => ({ status: 1, stderr: "unshare: unshare failed: Operation not permitted\n" });
		expect(() => assertUnshareWorks(run)).toThrow(/Operation not permitted.*did not start/s);
	});

	it("fails loudly when unshare is missing", () => {
		const run = () => ({ error: new Error("spawnSync unshare ENOENT"), status: null });
		expect(() => assertUnshareWorks(run)).toThrow(/ENOENT/);
	});

	it("falls back to the exit code when unshare prints nothing", () => {
		expect(() => assertUnshareWorks(() => ({ status: 2 }))).toThrow(/exit code 2/);
	});
});

describe("runIsolated", () => {
	const setup = () => {
		const child = Object.assign(new EventEmitter(), { kill: vi.fn() });
		const start = vi.fn(() => child);
		const proc = new EventEmitter();
		const promise = runIsolated({
			start,
			execPath: "/usr/bin/node",
			execArgv: ["--conditions=dev"],
			argv: ["/usr/bin/node", "tests/run.mjs", "--coverage"],
			env: { A: "1" },
			proc
		});
		return { child, start, proc, promise };
	};

	it("re-runs the same command line under unshare and returns its exit code", async () => {
		const { child, start, promise } = setup();
		expect(start).toHaveBeenCalledWith(
			"unshare",
			[...UNSHARE_ARGS, "--", "/usr/bin/node", "--conditions=dev", "tests/run.mjs", "--coverage"],
			{ stdio: "inherit", env: { A: "1" } }
		);
		child.emit("exit", 3, null);
		await expect(promise).resolves.toBe(3);
	});

	it("passes SIGINT and SIGTERM on, and stops listening once it's done", async () => {
		const { child, proc, promise } = setup();
		proc.emit("SIGTERM", "SIGTERM");
		proc.emit("SIGINT", "SIGINT");
		expect(child.kill.mock.calls).toEqual([["SIGTERM"], ["SIGINT"]]);
		child.emit("exit", null, "SIGTERM");
		await expect(promise).resolves.toBe(128 + 15);
		expect(proc.listenerCount("SIGINT") + proc.listenerCount("SIGTERM")).toBe(0);
	});

	it("maps an unknown signal to 128", async () => {
		const { child, promise } = setup();
		child.emit("exit", null, "SIGNOPE");
		await expect(promise).resolves.toBe(128);
	});

	it("rejects when unshare can't be started", async () => {
		const { child, proc, promise } = setup();
		child.emit("error", new Error("spawn unshare ENOENT"));
		await expect(promise).rejects.toThrow(/ENOENT/);
		expect(proc.listenerCount("SIGINT")).toBe(0);
	});
});
