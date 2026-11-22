/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/runner/run-isolate.test.vitest.mjs
 *	@Date: 2026-11-21T12:13:25-08:00 (1795292005)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-21T16:59:14-08:00 (1795309154)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * run() with isolation requested: the isolate module is mocked, so nothing re-executes.
 */
import { vi, describe, it, expect, afterEach } from "vitest";

vi.mock("../../src/core/isolate.mjs", async (importOriginal) => ({
	...(await importOriginal()),
	inPidNamespace: vi.fn(() => false),
	assertUnshareWorks: vi.fn(),
	runIsolated: vi.fn(async () => 7)
}));

import { run } from "../../src/index.mjs";
import { inPidNamespace, assertUnshareWorks, runIsolated } from "../../src/core/isolate.mjs";

afterEach(() => {
	vi.clearAllMocks();
	delete process.env.CLDMV_TEST_ISOLATE;
});

describe("run({ isolate })", () => {
	it("re-runs under unshare and returns that run's exit code", async () => {
		await expect(run({ isolate: true })).resolves.toBe(7);
		expect(assertUnshareWorks).toHaveBeenCalledOnce();
		expect(runIsolated).toHaveBeenCalledOnce();
	});

	it("takes CLDMV_TEST_ISOLATE=1 when the option isn't set", async () => {
		process.env.CLDMV_TEST_ISOLATE = "1";
		await expect(run({})).resolves.toBe(7);
	});

	it("refuses json, before starting anything", async () => {
		await expect(run({ isolate: true, json: true })).rejects.toThrow(/json/);
		expect(runIsolated).not.toHaveBeenCalled();
	});

	it("fails loudly when unshare can't create the namespaces", async () => {
		vi.mocked(assertUnshareWorks).mockImplementationOnce(() => {
			throw new Error("vitest-runner: isolation is on but unprivileged user and PID namespaces aren't available here");
		});
		await expect(run({ isolate: true })).rejects.toThrow(/namespaces aren't available/);
		expect(runIsolated).not.toHaveBeenCalled();
	});

	it("needs Linux", async () => {
		const platform = Object.getOwnPropertyDescriptor(process, "platform");
		Object.defineProperty(process, "platform", { value: "darwin" });
		try {
			await expect(run({ isolate: true })).rejects.toThrow(/needs Linux; this is darwin/);
		} finally {
			Object.defineProperty(process, "platform", platform);
		}
	});

	it("takes CLDMV_TEST_ISOLATE=force, and re-runs even inside a PID namespace", async () => {
		process.env.CLDMV_TEST_ISOLATE = "force";
		vi.mocked(inPidNamespace).mockReturnValue(true);
		try {
			await expect(run({})).resolves.toBe(7);
			await expect(run({ isolate: "force" })).resolves.toBe(7);
		} finally {
			vi.mocked(inPidNamespace).mockReturnValue(false);
		}
		expect(assertUnshareWorks).toHaveBeenCalledTimes(2);
	});

	it("fails loudly when forced and unshare isn't permitted, never running unsandboxed", async () => {
		vi.mocked(inPidNamespace).mockReturnValueOnce(true);
		vi.mocked(assertUnshareWorks).mockImplementationOnce(() => {
			throw new Error("vitest-runner: isolation is on but unprivileged user and PID namespaces aren't available here");
		});
		await expect(run({ isolate: "force", _testResultsOverride: [] })).rejects.toThrow(/namespaces aren't available/);
		expect(runIsolated).not.toHaveBeenCalled();
	});

	it("doesn't re-run when already in a PID namespace", async () => {
		vi.mocked(inPidNamespace).mockReturnValueOnce(true);
		// Goes on to a normal run (injected results, so nothing spawns), json included.
		const report = await run({ isolate: true, json: true, _testResultsOverride: [] });
		expect(typeof report).toBe("object");
		expect(runIsolated).not.toHaveBeenCalled();
	});
});
