/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/core/watchdog.test.vitest.mjs
 *	@Date: 2026-11-22T21:43:21-08:00 (1795412601)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-22T21:43:38-08:00 (1795412618)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * Tests for the per-file watchdog (src/core/watchdog.mjs and its use in runSingleFile / run()).
 *
 * The runSingleFile cases use a stand-in "vitest binary" (tests/fixtures/watchdog/stand-in.mjs)
 * that hangs, prints forever, ignores SIGTERM or leaves its process group, so each limit can be
 * hit in well under a second. One run() case uses a real vitest fixture that never finishes.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
// run, runSingleFile and the live-child registry come from the package itself, so that under
// `--mode=dist` they are all the built copy and share one registry.
import { killChildProcessGroups, liveChildCount, run, runSingleFile } from "@cldmv/vitest-runner";
import {
	DEFAULT_FILE_IDLE_TIMEOUT_MS,
	DEFAULT_FILE_TIMEOUT_MS,
	FILE_IDLE_TIMEOUT_ENV,
	FILE_TIMEOUT_ENV,
	formatLimit,
	getTimeoutsForFile,
	resolveFileTimeouts,
	tailLines,
	usesProcessGroups
} from "../../src/core/watchdog.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "../..");
const FIXTURE_DIR = path.join(PKG_ROOT, "tests", "fixtures", "watchdog");
const STAND_IN = path.join(FIXTURE_DIR, "stand-in.mjs");
const WORK = path.join(PKG_ROOT, "tmp", `watchdog-tests-${process.pid}`);

/** Pids started by the stand-in, killed after each test whatever happened. */
const strays = [];

afterEach(async () => {
	for (const pid of strays.splice(0)) {
		try {
			process.kill(pid, "SIGKILL");
		} catch {
			// already gone
		}
	}
	await fsp.rm(WORK, { recursive: true, force: true });
});

/** @param {number} pid */
const isAlive = (pid) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};

/**
 * Run the stand-in in `mode` and return the result plus the grandchild's pid.
 * @param {string} mode
 * @param {object} [opts]
 */
async function runStandIn(mode, opts = {}) {
	await fsp.mkdir(WORK, { recursive: true });
	const pidFile = path.join(WORK, `${mode}-${Math.random().toString(36).slice(2)}.pid`);
	const result = await runSingleFile("watchdog-target", {
		cwd: PKG_ROOT,
		vitestBin: STAND_IN,
		streamOutput: false,
		extraEnv: { WATCHDOG_MODE: mode, WATCHDOG_PID_FILE: pidFile },
		...opts
	});
	const grandchild = fs.existsSync(pidFile) ? Number(fs.readFileSync(pidFile, "utf8")) : undefined;
	if (grandchild) strays.push(grandchild);
	return { result, grandchild };
}

// ─── limits ──────────────────────────────────────────────────────────────────

describe("resolveFileTimeouts", () => {
	it("defaults to 30 minutes and 10 minutes", () => {
		expect(resolveFileTimeouts({}, {})).toEqual({ timeoutMs: DEFAULT_FILE_TIMEOUT_MS, idleTimeoutMs: DEFAULT_FILE_IDLE_TIMEOUT_MS });
		expect(DEFAULT_FILE_TIMEOUT_MS).toBe(30 * 60 * 1000);
		expect(DEFAULT_FILE_IDLE_TIMEOUT_MS).toBe(10 * 60 * 1000);
		expect(resolveFileTimeouts(undefined, {}).timeoutMs).toBe(DEFAULT_FILE_TIMEOUT_MS);
	});

	it("reads the env vars in seconds, and an option in ms wins over them", () => {
		const env = { [FILE_TIMEOUT_ENV]: "90", [FILE_IDLE_TIMEOUT_ENV]: "0" };
		expect(resolveFileTimeouts({}, env)).toEqual({ timeoutMs: 90_000, idleTimeoutMs: 0 });
		expect(resolveFileTimeouts({ timeoutMs: 5000, idleTimeoutMs: 2500.7 }, env)).toEqual({ timeoutMs: 5000, idleTimeoutMs: 2500 });
	});

	it("ignores negative, non-numeric and empty values", () => {
		const env = { [FILE_TIMEOUT_ENV]: "soon", [FILE_IDLE_TIMEOUT_ENV]: "" };
		expect(resolveFileTimeouts({ timeoutMs: -1, idleTimeoutMs: "abc" }, env)).toEqual({
			timeoutMs: DEFAULT_FILE_TIMEOUT_MS,
			idleTimeoutMs: DEFAULT_FILE_IDLE_TIMEOUT_MS
		});
		expect(resolveFileTimeouts({ timeoutMs: null, idleTimeoutMs: "" }, { [FILE_TIMEOUT_ENV]: "-5" }).timeoutMs).toBe(
			DEFAULT_FILE_TIMEOUT_MS
		);
	});
});

describe("getTimeoutsForFile", () => {
	const defaults = { timeoutMs: 1000, idleTimeoutMs: 500 };

	it("returns the defaults when no pattern matches", () => {
		expect(getTimeoutsForFile("tests/a.test.vitest.mjs", defaults, [{ pattern: "slow/", timeoutMs: 9 }])).toBe(defaults);
		expect(getTimeoutsForFile("tests/a.test.vitest.mjs", defaults)).toBe(defaults);
	});

	it("applies the first match, keeping the defaults for limits it doesn't set", () => {
		const overrides = [
			{ pattern: "browser/", timeoutMs: 0 },
			{ pattern: "browser/", timeoutMs: 1, idleTimeoutMs: 1 }
		];
		expect(getTimeoutsForFile("tests\\browser\\ui.test.vitest.mjs", defaults, overrides)).toEqual({ timeoutMs: 0, idleTimeoutMs: 500 });
	});
});

describe("formatLimit and tailLines", () => {
	it("formats minutes, seconds and milliseconds", () => {
		expect(formatLimit(30 * 60 * 1000)).toBe("30 min");
		expect(formatLimit(90_000)).toBe("90 s");
		expect(formatLimit(1500)).toBe("1500 ms");
		expect(formatLimit(250)).toBe("250 ms");
	});

	it("keeps the last non-empty lines", () => {
		expect(tailLines("a\n\nb\r\nc\n  \n", 2)).toBe("b\nc");
		expect(tailLines("")).toBe("");
	});
});

// ─── runSingleFile ───────────────────────────────────────────────────────────

describe.runIf(usesProcessGroups())("runSingleFile — watchdog", () => {
	it("kills a file that runs past its time limit and reports its last output", async () => {
		const { result } = await runStandIn("chatty", { timeoutMs: 700 });
		expect(result.code).toBe(1);
		expect(result.timedOut).toBe("ran longer than 700 ms");
		expect(result.testFilesFail).toBe(1);
		expect(result.errors[0]).toMatch(/^ran longer than 700 ms; killed its process group\. Last output:\n[\s\S]*tick \d+$/);
		expect(result.duration).toBeGreaterThanOrEqual(700);
	});

	it("kills a file that prints nothing for its idle limit, grandchildren included", async () => {
		const { result, grandchild } = await runStandIn("hang", { idleTimeoutMs: 1500, timeoutMs: 60_000 });
		expect(result.timedOut).toBe("printed nothing for 1500 ms");
		expect(result.errors[0]).toContain("stand-in started grandchild");
		expect(grandchild).toBeGreaterThan(0);
		await vi.waitFor(() => expect(isAlive(grandchild)).toBe(false));
	});

	it("says so when a killed file printed nothing at all", async () => {
		const { result } = await runStandIn("silent", { idleTimeoutMs: 300 });
		expect(result.errors[0]).toBe("printed nothing for 300 ms; killed its process group. It printed nothing.");
	});

	it("SIGKILLs a group that ignores SIGTERM after the grace period", async () => {
		// Every limit sits well above Node's startup time, so the stand-in has always printed its first
		// line and started its grandchild before anything fires. The idle limit fires first; the time
		// limit then comes up inside the SIGTERM grace period
		// and changes nothing.
		const { result, grandchild } = await runStandIn("ignore-term", { idleTimeoutMs: 1500, timeoutMs: 2000, killGraceMs: 1500 });
		expect(result.timedOut).toBe("printed nothing for 1500 ms");
		expect(result.rawOutput).toContain("stand-in got SIGTERM, ignoring it");
		await vi.waitFor(() => expect(isAlive(grandchild)).toBe(false));
	});

	it("reports anyway when a process outside the group keeps the output pipes open", async () => {
		const { result, grandchild } = await runStandIn("escape", { idleTimeoutMs: 1500, killGraceMs: 300 });
		expect(result.timedOut).toBe("printed nothing for 1500 ms");
		expect(result.code).toBe(1);
		// It left the group, so the group kill didn't reach it; afterEach kills it.
		expect(isAlive(grandchild)).toBe(true);
	});

	it("prints a line when it kills a file whose output is streamed", async () => {
		const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
		vi.spyOn(process.stdout, "write").mockImplementation(() => true);
		try {
			await runStandIn("silent", { idleTimeoutMs: 200, streamOutput: true });
			expect(write).toHaveBeenCalledWith("\n⏱️  watchdog-target: printed nothing for 200 ms; killing its process group\n");
		} finally {
			vi.restoreAllMocks();
		}
	});

	it("killChildProcessGroups ends every live file without a timeout", async () => {
		const pending = runStandIn("hang");
		await vi.waitFor(() => expect(killChildProcessGroups("SIGKILL")).toBeGreaterThan(0));
		const { result, grandchild } = await pending;
		expect(result.code).toBe(1);
		expect(result.timedOut).toBeUndefined();
		await vi.waitFor(() => expect(isAlive(grandchild)).toBe(false));
		expect(killChildProcessGroups()).toBe(0);
	});
});

// ─── run() ───────────────────────────────────────────────────────────────────

describe.runIf(usesProcessGroups())("run() — watchdog", () => {
	it("fails a hung file through perFileTimeoutOverrides and still reports the run", async () => {
		const report = await run({
			cwd: PKG_ROOT,
			testDir: FIXTURE_DIR,
			testFilePattern: /\.watchdog\.mjs$/,
			vitestConfig: path.join(FIXTURE_DIR, "vitest.config.mjs"),
			perFileTimeoutOverrides: [{ pattern: "hang.watchdog", timeoutMs: 4000 }],
			fileIdleTimeoutMs: 0,
			fsModuleCachePath: false,
			scratchDir: path.join(WORK, "scratch"),
			json: true
		});
		expect(report.exitCode).toBe(1);
		expect(report.results.all).toHaveLength(1);
		const [result] = report.results.all;
		expect(result.timedOut).toBe("ran longer than 4 s");
		expect(result.errors[0]).toMatch(/^ran longer than 4 s; killed its process group\./);
	}, 60_000);

	const HANG_RUN = {
		cwd: PKG_ROOT,
		testDir: FIXTURE_DIR,
		testFilePattern: /\.watchdog\.mjs$/,
		vitestConfig: path.join(FIXTURE_DIR, "vitest.config.mjs"),
		fileTimeoutMs: 0,
		fileIdleTimeoutMs: 0,
		fsModuleCachePath: false,
		json: true
	};

	it("kills the live files when the process exits mid-run", async () => {
		const before = new Set(process.listeners("exit"));
		const pending = run({ ...HANG_RUN, scratchDir: path.join(WORK, "exit-scratch") });
		await vi.waitFor(() => expect(liveChildCount()).toBe(1), { timeout: 30_000 });
		const onExit = process.listeners("exit").findLast((listener) => !before.has(listener));
		onExit();
		const report = await pending;
		expect(report.exitCode).toBe(1);
		expect(liveChildCount()).toBe(0);
		expect(process.listeners("exit")).not.toContain(onExit);
	}, 60_000);

	it("kills the live files on SIGINT and keeps the scratch root with keepTmp", async () => {
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {});
		const savedExitCode = process.exitCode;
		const scratchDir = path.join(WORK, "keep-scratch");
		try {
			const pending = run({ ...HANG_RUN, scratchDir, keepTmp: true });
			await vi.waitFor(() => expect(liveChildCount()).toBe(1), { timeout: 30_000 });
			process.emit("SIGINT");
			expect(process.exitCode).toBe(130);
			expect(exitSpy).toHaveBeenCalledOnce();
			await pending;
			expect(liveChildCount()).toBe(0);
			expect(fs.readdirSync(scratchDir).length).toBeGreaterThan(0);
		} finally {
			exitSpy.mockRestore();
			process.exitCode = savedExitCode;
		}
	}, 60_000);
});
