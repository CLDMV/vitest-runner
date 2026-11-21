/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/core/scratch.test.vitest.mjs
 *	@Date: 2026-09-27T03:31:00-07:00 (1790505060)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-21T12:14:15-08:00 (1795292055)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * @fileoverview Unit tests for src/core/scratch.mjs
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";
import { alive } from "@cldmv/lib-process";
import {
	DEFAULT_SCRATCH_DIR,
	STALE_ROOT_AGE_MS,
	STALE_LEGACY_ROOT_AGE_MS,
	HEARTBEAT_MS,
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

/** Leaves a socket nobody listens on at `<dir>/alive.sock`, the way a crashed run leaves it. */
async function makeDeadSocket(dir) {
	const temp = path.join(dir, ".t");
	const server = net.createServer();
	await new Promise((resolve) => server.listen(temp, resolve));
	await fs.rename(temp, path.join(dir, alive.SOCKET_NAME));
	await new Promise((resolve) => server.close(resolve));
}

/** Sets a folder's modification time `ageMs` in the past. */
async function age(dir, ageMs) {
	const then = new Date(Date.now() - ageMs);
	await fs.utimes(dir, then, then);
}

const exists = (dir) =>
	fs.access(dir).then(
		() => true,
		() => false
	);

// ─── sweepStaleScratchRoots ──────────────────────────────────────────────────

describe("sweepStaleScratchRoots", () => {
	/** @type {{ release: () => Promise<void> }[]} */
	let held = [];

	afterEach(async () => {
		await Promise.all(held.map((h) => h.release()));
		held = [];
	});

	it("does nothing when the scratch base directory does not exist", async () => {
		await expect(sweepStaleScratchRoots(TMP_ROOT, "does-not-exist")).resolves.toBeUndefined();
	});

	it("removes a root whose socket is dead and keeps one a live run holds", async () => {
		const base = path.join(TMP_ROOT, "sweep");
		const deadRoot = path.join(base, "0123456789abcdef");
		await fs.mkdir(deadRoot, { recursive: true });
		await makeDeadSocket(deadRoot);
		const live = await createRunScratchRoot(TMP_ROOT, "sweep");
		held.push(live);
		// Even an old modification time doesn't matter while the socket answers.
		await age(live.root, STALE_ROOT_AGE_MS * 2);

		await sweepStaleScratchRoots(TMP_ROOT, "sweep");

		expect(await exists(deadRoot)).toBe(false);
		expect(await exists(live.root)).toBe(true);
	});

	it("keeps a young root with no socket and removes it once it's past the age limit", async () => {
		const base = path.join(TMP_ROOT, "sweep-age");
		const young = path.join(base, "aaaaaaaaaaaaaaaa");
		const old = path.join(base, "bbbbbbbbbbbbbbbb");
		await fs.mkdir(young, { recursive: true });
		await fs.mkdir(old, { recursive: true });
		await age(old, STALE_ROOT_AGE_MS + 60_000);

		await sweepStaleScratchRoots(TMP_ROOT, "sweep-age");

		expect(await exists(young)).toBe(true);
		expect(await exists(old)).toBe(false);
	});

	it("treats a root whose socket path is too long as having no socket", async () => {
		const scratchDir = path.join("sweep-long", "x".repeat(alive.MAX_SOCKET_PATH_BYTES));
		const root = path.join(TMP_ROOT, scratchDir, "cccccccccccccccc");
		await fs.mkdir(root, { recursive: true });
		await age(root, STALE_ROOT_AGE_MS + 60_000);

		await sweepStaleScratchRoots(TMP_ROOT, scratchDir);

		expect(await exists(root)).toBe(false);
	});

	it("removes legacy <pid>-<timestamp> roots by age only, and leaves other entries alone", async () => {
		const base = path.join(TMP_ROOT, "sweep-legacy");
		const recentLegacy = path.join(base, `${process.pid}-111`);
		const oldLegacy = path.join(base, "999999-222");
		const nonMatching = path.join(base, "not-a-run-root");
		const notADir = path.join(base, "deadbeefdeadbeef");
		await fs.mkdir(recentLegacy, { recursive: true });
		await fs.mkdir(oldLegacy, { recursive: true });
		await fs.mkdir(nonMatching, { recursive: true });
		await fs.writeFile(notADir, "x");
		await age(oldLegacy, STALE_LEGACY_ROOT_AGE_MS + 60_000);
		await age(nonMatching, STALE_LEGACY_ROOT_AGE_MS + 60_000);

		await sweepStaleScratchRoots(TMP_ROOT, "sweep-legacy");

		expect(await exists(recentLegacy)).toBe(true);
		expect(await exists(oldLegacy)).toBe(false);
		expect(await exists(nonMatching)).toBe(true);
		expect(await exists(notADir)).toBe(true);
	});

	it("keeps a root it can't stat", async () => {
		const base = path.join(TMP_ROOT, "sweep-stat");
		const root = path.join(base, "dddddddddddddddd");
		await fs.mkdir(root, { recursive: true });
		const spy = vi.spyOn(fs, "stat").mockRejectedValueOnce(new Error("simulated stat failure"));
		await sweepStaleScratchRoots(TMP_ROOT, "sweep-stat");
		spy.mockRestore();
		expect(await exists(root)).toBe(true);
	});

	it("swallows an fs.rm failure for one stale root and continues (does not throw)", async () => {
		const base = path.join(TMP_ROOT, "sweep-rm-failure");
		const deadRoot = path.join(base, "eeeeeeeeeeeeeeee");
		await fs.mkdir(deadRoot, { recursive: true });
		await makeDeadSocket(deadRoot);

		const spy = vi.spyOn(fs, "rm").mockRejectedValueOnce(new Error("simulated rm failure"));
		await expect(sweepStaleScratchRoots(TMP_ROOT, "sweep-rm-failure")).resolves.toBeUndefined();
		spy.mockRestore();
	});
});

// ─── createRunScratchRoot / createFileScratchDir / removeScratchRoot(Sync) ──

describe("createRunScratchRoot", () => {
	it("creates a randomly named root under the scratch base and holds it until released", async () => {
		const { root, release } = await createRunScratchRoot(TMP_ROOT, "runs");
		expect(root).toMatch(/runs[\\/][0-9a-f]{16}$/);
		expect((await fs.stat(root)).isDirectory()).toBe(true);
		expect(await alive.check(root)).toBe("alive");

		await release();
		await release();
		expect(await alive.check(root)).toBe("unknown");
	});

	it("gives two runs different roots", async () => {
		const a = await createRunScratchRoot(TMP_ROOT, "runs");
		const b = await createRunScratchRoot(TMP_ROOT, "runs");
		expect(a.root).not.toBe(b.root);
		await Promise.all([a.release(), b.release()]);
	});

	it("still creates the root when its socket path is too long, without a socket", async () => {
		const scratchDir = path.join("runs-long", "y".repeat(alive.MAX_SOCKET_PATH_BYTES));
		const { root, release } = await createRunScratchRoot(TMP_ROOT, scratchDir);
		expect((await fs.stat(root)).isDirectory()).toBe(true);
		expect(await alive.check(root).catch(() => "unknown")).toBe("unknown");
		await release();
	});

	it("refreshes the root's modification time every heartbeat", async () => {
		vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
		try {
			const { root, release } = await createRunScratchRoot(TMP_ROOT, "runs");
			await age(root, STALE_ROOT_AGE_MS);
			vi.advanceTimersByTime(HEARTBEAT_MS);
			await vi.waitFor(async () => expect(Date.now() - (await fs.stat(root)).mtimeMs).toBeLessThan(60_000));
			await release();
		} finally {
			vi.useRealTimers();
		}
	});

	it("ignores a failed heartbeat", async () => {
		vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
		const spy = vi.spyOn(fs, "utimes").mockRejectedValueOnce(new Error("simulated utimes failure"));
		try {
			const { release } = await createRunScratchRoot(TMP_ROOT, "runs");
			vi.advanceTimersByTime(HEARTBEAT_MS);
			await vi.waitFor(() => expect(spy).toHaveBeenCalled());
			await release();
		} finally {
			spy.mockRestore();
			vi.useRealTimers();
		}
	});
});

describe("createFileScratchDir", () => {
	it("creates a numbered worker subdirectory under the run root", async () => {
		const { root, release } = await createRunScratchRoot(TMP_ROOT, "runs");
		const dir = await createFileScratchDir(root, 3);
		expect(dir).toBe(path.join(root, "worker-3"));
		const stat = await fs.stat(dir);
		expect(stat.isDirectory()).toBe(true);
		await release();
	});
});

describe("removeScratchRoot", () => {
	it("removes an existing root", async () => {
		const { root, release } = await createRunScratchRoot(TMP_ROOT, "runs");
		await release();
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
		const { root, release } = await createRunScratchRoot(TMP_ROOT, "runs");
		await release();
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
