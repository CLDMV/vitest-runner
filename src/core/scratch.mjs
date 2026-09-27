/**
 * @fileoverview Per-run scratch directory lifecycle — root creation, per-file
 * subdirectories, stale-root sweeping, and the public makeRunTmpDir() helper
 * test files use to get their own scratch space.
 * @module vitest-runner/src/core/scratch
 */

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";

/** Default scratch root, relative to `cwd`. */
export const DEFAULT_SCRATCH_DIR = "tmp/vitest-runner";

/** Matches a run root's directory name: `<pid>-<timestamp>`. */
const RUN_ROOT_NAME_PATTERN = /^(\d+)-\d+$/;

/**
 * Check whether a process is still alive.
 *
 * @param {number} pid
 * @returns {boolean}
 */
export function isPidAlive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		// ESRCH: no such process. Any other error (e.g. EPERM — process exists
		// but we lack permission to signal it) means it's still alive.
		return err.code !== "ESRCH";
	}
}

/**
 * Sanitize a label for use as a directory name segment.
 *
 * @param {string} label
 * @returns {string}
 */
function sanitizeLabel(label) {
	const cleaned = String(label)
		.replace(/[^a-zA-Z0-9_-]+/g, "-")
		.slice(0, 80);
	return cleaned || "scratch";
}

/**
 * Remove scratch roots left behind by runs whose owning process is no longer alive
 * (a crash or `kill -9` skips the normal exit-time cleanup).
 *
 * @param {string} cwd - Project root.
 * @param {string} scratchDir - Scratch base directory, relative to `cwd` (or absolute).
 * @returns {Promise<void>}
 */
export async function sweepStaleScratchRoots(cwd, scratchDir) {
	const base = path.resolve(cwd, scratchDir);

	let entries;
	try {
		entries = await fs.readdir(base, { withFileTypes: true });
	} catch {
		return;
	}

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const match = entry.name.match(RUN_ROOT_NAME_PATTERN);
		if (!match) continue;

		const pid = parseInt(match[1], 10);
		if (isPidAlive(pid)) continue;

		await fs.rm(path.join(base, entry.name), { recursive: true, force: true }).catch(() => {});
	}
}

/**
 * Create this run's scratch root: `<cwd>/<scratchDir>/<pid>-<timestamp>/`.
 *
 * @param {string} cwd - Project root.
 * @param {string} scratchDir - Scratch base directory, relative to `cwd` (or absolute).
 * @returns {Promise<string>} Absolute path to the created root.
 */
export async function createRunScratchRoot(cwd, scratchDir) {
	const base = path.resolve(cwd, scratchDir);
	const root = path.join(base, `${process.pid}-${Date.now()}`);
	await fs.mkdir(root, { recursive: true });
	return root;
}

/**
 * Create a scratch subdirectory under the run root for one file invocation.
 *
 * @param {string} runRoot - This run's scratch root, from `createRunScratchRoot`.
 * @param {number} index - A unique index for this invocation within the run.
 * @returns {Promise<string>} Absolute path to the created directory.
 */
export async function createFileScratchDir(runRoot, index) {
	const dir = path.join(runRoot, `worker-${index}`);
	await fs.mkdir(dir, { recursive: true });
	return dir;
}

/**
 * Remove a run's scratch root (async, best-effort).
 *
 * @param {string} root
 * @returns {Promise<void>}
 */
export async function removeScratchRoot(root) {
	await fs.rm(root, { recursive: true, force: true }).catch(() => {});
}

/**
 * Remove a run's scratch root synchronously (best-effort) — used from a signal
 * handler right before `process.exit()`, where async cleanup can't be awaited.
 *
 * @param {string} root
 * @returns {void}
 */
export function removeScratchRootSync(root) {
	try {
		fsSync.rmSync(root, { recursive: true, force: true });
	} catch {
		// Best-effort cleanup on signal exit — nothing to recover into.
	}
}

/**
 * Create a fresh, uniquely-named scratch subdirectory for the calling test file.
 *
 * Reads the run's scratch directory from `process.env.VITEST_RUNNER_TMP`, which
 * vitest-runner sets in every spawned child. Call this from a test file to get
 * isolated scratch space per test case without managing your own `mkdtemp` base.
 *
 * @param {string} label - A short, human-readable label used as the directory name prefix.
 * @returns {string} Absolute path to the newly created directory.
 * @throws {Error} When `VITEST_RUNNER_TMP` is not set (not running under vitest-runner).
 * @example
 * import { makeRunTmpDir } from "@cldmv/vitest-runner";
 * const dir = makeRunTmpDir("my-fixture");
 */
export function makeRunTmpDir(label) {
	const base = process.env.VITEST_RUNNER_TMP;
	if (!base) {
		throw new Error("makeRunTmpDir() requires VITEST_RUNNER_TMP to be set — call it from a test file run by vitest-runner.");
	}
	return fsSync.mkdtempSync(path.join(base, `${sanitizeLabel(label)}-`));
}
