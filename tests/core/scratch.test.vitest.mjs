/**
 * @fileoverview Unit tests for src/core/scratch.mjs
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
	DEFAULT_SCRATCH_DIR,
	isPidAlive,
	sweepStaleScratchRoots,
	createRunScratchRoot,
	createFileScratchDir,
	removeScratchRoot,
	removeScratchRootSync,
	makeRunTmpDir
} from "../../src/core/scratch.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "../..");
const TMP_ROOT = path.join(PKG_ROOT, "tmp", "scratch-tests");

afterEach(async () => {
	await fs.rm(TMP_ROOT, { recursive: true, force: true });
	delete process.env.VITEST_RUNNER_TMP;
});

// ─── DEFAULT_SCRATCH_DIR ────────────────────────────────────────────────────

describe("DEFAULT_SCRATCH_DIR", () => {
	it("is the documented default", () => {
		expect(DEFAULT_SCRATCH_DIR).toBe("tmp/vitest-runner");
	});
});

// ─── isPidAlive ──────────────────────────────────────────────────────────────

describe("isPidAlive", () => {
	it("returns true for the current process", () => {
		expect(isPidAlive(process.pid)).toBe(true);
	});

	it("returns false for a pid that has already exited (ESRCH)", () => {
		// Spawn a child that exits immediately, then reuse its now-dead pid.
		const result = spawnSync(process.execPath, ["-e", "process.exit(0)"]);
		expect(isPidAlive(result.pid)).toBe(false);
	});

	it("returns true when process.kill throws a non-ESRCH error (e.g. EPERM)", () => {
		const spy = vi.spyOn(process, "kill").mockImplementation(() => {
			const err = new Error("EPERM");
			err.code = "EPERM";
			throw err;
		});
		expect(isPidAlive(999999)).toBe(true);
		spy.mockRestore();
	});
});

// ─── sweepStaleScratchRoots ──────────────────────────────────────────────────

describe("sweepStaleScratchRoots", () => {
	it("does nothing when the scratch base directory does not exist", async () => {
		await expect(sweepStaleScratchRoots(TMP_ROOT, "does-not-exist")).resolves.toBeUndefined();
	});

	it("removes roots owned by a dead pid and keeps roots owned by a live pid", async () => {
		const base = path.join(TMP_ROOT, "sweep");
		const deadResult = spawnSync(process.execPath, ["-e", "process.exit(0)"]);
		const deadRoot = path.join(base, `${deadResult.pid}-111`);
		const liveRoot = path.join(base, `${process.pid}-222`);
		const nonMatching = path.join(base, "not-a-run-root");
		const notADir = path.join(base, "some-file.txt");

		await fs.mkdir(deadRoot, { recursive: true });
		await fs.mkdir(liveRoot, { recursive: true });
		await fs.mkdir(nonMatching, { recursive: true });
		await fs.mkdir(base, { recursive: true });
		await fs.writeFile(notADir, "x");

		await sweepStaleScratchRoots(TMP_ROOT, "sweep");

		await expect(fs.access(deadRoot)).rejects.toThrow();
		await expect(fs.access(liveRoot)).resolves.toBeUndefined();
		await expect(fs.access(nonMatching)).resolves.toBeUndefined();
	});

	it("swallows an fs.rm failure for one stale root and continues (does not throw)", async () => {
		const base = path.join(TMP_ROOT, "sweep-rm-failure");
		const deadResult = spawnSync(process.execPath, ["-e", "process.exit(0)"]);
		const deadRoot = path.join(base, `${deadResult.pid}-333`);
		await fs.mkdir(deadRoot, { recursive: true });

		const spy = vi.spyOn(fs, "rm").mockRejectedValueOnce(new Error("simulated rm failure"));
		await expect(sweepStaleScratchRoots(TMP_ROOT, "sweep-rm-failure")).resolves.toBeUndefined();
		spy.mockRestore();
	});
});

// ─── createRunScratchRoot / createFileScratchDir / removeScratchRoot(Sync) ──

describe("createRunScratchRoot", () => {
	it("creates a directory named <pid>-<timestamp> under the scratch base", async () => {
		const root = await createRunScratchRoot(TMP_ROOT, "runs");
		expect(root).toMatch(new RegExp(`runs[\\\\/]${process.pid}-\\d+$`));
		const stat = await fs.stat(root);
		expect(stat.isDirectory()).toBe(true);
	});
});

describe("createFileScratchDir", () => {
	it("creates a numbered worker subdirectory under the run root", async () => {
		const root = await createRunScratchRoot(TMP_ROOT, "runs");
		const dir = await createFileScratchDir(root, 3);
		expect(dir).toBe(path.join(root, "worker-3"));
		const stat = await fs.stat(dir);
		expect(stat.isDirectory()).toBe(true);
	});
});

describe("removeScratchRoot", () => {
	it("removes an existing root", async () => {
		const root = await createRunScratchRoot(TMP_ROOT, "runs");
		await removeScratchRoot(root);
		await expect(fs.access(root)).rejects.toThrow();
	});

	it("is a no-op (does not throw) for a root that does not exist", async () => {
		await expect(removeScratchRoot(path.join(TMP_ROOT, "never-created"))).resolves.toBeUndefined();
	});

	it("swallows an fs.rm failure (does not throw)", async () => {
		const spy = vi.spyOn(fs, "rm").mockRejectedValueOnce(new Error("simulated rm failure"));
		await expect(removeScratchRoot(path.join(TMP_ROOT, "whatever"))).resolves.toBeUndefined();
		spy.mockRestore();
	});
});

describe("removeScratchRootSync", () => {
	it("removes an existing root synchronously", async () => {
		const root = await createRunScratchRoot(TMP_ROOT, "runs");
		removeScratchRootSync(root);
		expect(fsSync.existsSync(root)).toBe(false);
	});

	it("does not throw for a root that cannot be removed", () => {
		const spy = vi.spyOn(fsSync, "rmSync").mockImplementation(() => {
			throw new Error("simulated rm failure");
		});
		expect(() => removeScratchRootSync(path.join(TMP_ROOT, "whatever"))).not.toThrow();
		spy.mockRestore();
	});
});

// ─── makeRunTmpDir ───────────────────────────────────────────────────────────

describe("makeRunTmpDir", () => {
	it("throws a descriptive error when VITEST_RUNNER_TMP is not set", () => {
		delete process.env.VITEST_RUNNER_TMP;
		expect(() => makeRunTmpDir("my-fixture")).toThrow(/VITEST_RUNNER_TMP/);
	});

	it("creates a uniquely-suffixed subdirectory under VITEST_RUNNER_TMP", async () => {
		const base = path.join(TMP_ROOT, "worker-0");
		await fs.mkdir(base, { recursive: true });
		process.env.VITEST_RUNNER_TMP = base;

		const dirA = makeRunTmpDir("my-fixture");
		const dirB = makeRunTmpDir("my-fixture");

		expect(dirA).not.toBe(dirB);
		expect(path.basename(dirA)).toMatch(/^my-fixture-/);
		expect(fsSync.existsSync(dirA)).toBe(true);
		expect(fsSync.existsSync(dirB)).toBe(true);
	});

	it("sanitizes a label containing unsafe characters", async () => {
		const base = path.join(TMP_ROOT, "worker-1");
		await fs.mkdir(base, { recursive: true });
		process.env.VITEST_RUNNER_TMP = base;

		const dir = makeRunTmpDir("weird label/with:chars!!");
		expect(path.basename(dir)).toMatch(/^weird-label-with-chars-+-/);
	});

	it("falls back to a default label for an empty label", async () => {
		const base = path.join(TMP_ROOT, "worker-2");
		await fs.mkdir(base, { recursive: true });
		process.env.VITEST_RUNNER_TMP = base;

		const dir = makeRunTmpDir("");
		expect(path.basename(dir)).toMatch(/^scratch-/);
	});
});
