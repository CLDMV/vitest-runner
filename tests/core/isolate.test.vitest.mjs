/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/core/isolate.test.vitest.mjs
 *	@Date: 2026-11-21T12:13:25-08:00 (1795292005)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-21T16:59:13-08:00 (1795309153)
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
	ISOLATED_ENV,
	INITIAL_PID_NAMESPACE_INODE,
	UNSHARE_ARGS,
	isolationRequested,
	shouldIsolate,
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

	it("reads force from the option or CLDMV_TEST_ISOLATE=force", () => {
		expect(isolationRequested("force", {})).toBe("force");
		expect(isolationRequested(undefined, { [ISOLATE_ENV]: "force" })).toBe("force");
		expect(isolationRequested(true, { [ISOLATE_ENV]: "force" })).toBe(true);
		expect(isolationRequested(undefined, { [ISOLATE_ENV]: "FORCE" })).toBe(false);
	});
});

describe("shouldIsolate", () => {
	const inside = () => true;
	const outside = () => false;

	it("is off when isolation is off", () => {
		expect(shouldIsolate(false, { env: {}, namespaced: outside })).toBe(false);
	});

	it("skips an already namespaced process unless forced", () => {
		expect(shouldIsolate(true, { env: {}, namespaced: outside })).toBe(true);
		expect(shouldIsolate(true, { env: {}, namespaced: inside })).toBe(false);
		expect(shouldIsolate("force", { env: {}, namespaced: inside })).toBe(true);
	});

	it("reads the real /proc by default", () => {
		expect(shouldIsolate("force", { env: {} })).toBe(true);
	});
});

describe("consumeIsolatedMarker", () => {
	// The marker flips module state for the rest of the process, so each test gets a fresh module.
	const fresh = async () => {
		vi.resetModules();
		return import("../../src/core/isolate.mjs");
	};

	it("is false and leaves nothing behind without the marker", async () => {
		const { consumeIsolatedMarker } = await fresh();
		const env = {};
		expect(consumeIsolatedMarker(env)).toBe(false);
		expect(env).toEqual({});
	});

	it("never re-runs the re-run, even when forced, and removes the marker", async () => {
		const mod = await fresh();
		const env = { [mod.ISOLATED_ENV]: "1" };
		expect(mod.shouldIsolate("force", { env, namespaced: () => true })).toBe(false);
		expect(env).toEqual({});
		// Seen once is enough: a later run() in the same process stays put too.
		expect(mod.shouldIsolate("force", { env: {}, namespaced: () => true })).toBe(false);
	});

	it("reads process.env by default", async () => {
		const { consumeIsolatedMarker, ISOLATED_ENV: name } = await fresh();
		process.env[name] = "1";
		try {
			expect(consumeIsolatedMarker()).toBe(true);
			expect(process.env[name]).toBeUndefined();
		} finally {
			delete process.env[name];
		}
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
			{ stdio: "inherit", env: { A: "1", [ISOLATED_ENV]: "1" } }
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
