/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /src/core/scratch.mjs
 *	@Date: 2026-09-27T03:31:00-07:00 (1790505060)
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
 * @fileoverview Per-run scratch directory lifecycle — root creation, per-file
 * subdirectories, stale-root sweeping, and the public makeRunTmpDir() helper
 * test files use to get their own scratch space.
 * @module vitest-runner/src/core/scratch
 */

import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { alive } from "@cldmv/lib-process";

/** Default scratch root, relative to `cwd`. */
export const DEFAULT_SCRATCH_DIR = "tmp/vitest-runner";

/** Matches a run root's directory name: 16 random hex characters. */
const RUN_ROOT_NAME_PATTERN = /^[0-9a-f]{16}$/;

/** Matches a run root left by vitest-runner before 1.7: `<pid>-<timestamp>`. */
const LEGACY_RUN_ROOT_NAME_PATTERN = /^\d+-\d+$/;

/**
 * How long a run root with no liveness socket may go unmodified before it counts as stale.
 * A live run touches its root every {@link HEARTBEAT_MS}, so only a run that's gone ages past this.
 */
export const STALE_ROOT_AGE_MS = 10 * 60 * 1000;

/** Legacy `<pid>-<timestamp>` roots never had a heartbeat, so they get a day. */
export const STALE_LEGACY_ROOT_AGE_MS = 24 * 60 * 60 * 1000;

/** How often a live run refreshes its root's modification time. */
export const HEARTBEAT_MS = 60 * 1000;

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
 * Whether a run root with no usable socket has gone unmodified for longer than `maxAgeMs`.
 *
 * @param {string} dir
 * @param {number} maxAgeMs
 * @returns {Promise<boolean>}
 */
async function olderThan(dir, maxAgeMs) {
	try {
		const { mtimeMs } = await fs.stat(dir);
		return Date.now() - mtimeMs > maxAgeMs;
	} catch {
		return false;
	}
}

/**
 * Reads a run root's liveness without throwing: a socket path over the Unix limit counts as
 * "unknown", the same as no socket.
 *
 * @param {string} dir
 * @returns {Promise<"alive" | "dead" | "unknown">}
 */
async function checkRoot(dir) {
	try {
		return await alive.check(dir);
	} catch {
		return "unknown";
	}
}

/**
 * Remove scratch roots left behind by runs that are gone (a crash or `kill -9` skips the
 * normal exit-time cleanup).
 *
 * A live run holds a liveness socket in its root (`@cldmv/lib-process` `alive`), so a pid is
 * never trusted: inside a PID namespace every outside run's pid looks dead, and pids repeat
 * across namespaces. A root whose socket refuses connections is removed at once. A root with
 * no socket (a run still starting, a path too long for a Unix socket, Windows) is removed
 * only once it has gone unmodified for {@link STALE_ROOT_AGE_MS}; live runs refresh it every
 * {@link HEARTBEAT_MS}. Roots named the pre-1.7 way (`<pid>-<timestamp>`) are removed by age
 * alone, after {@link STALE_LEGACY_ROOT_AGE_MS}.
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
		const dir = path.join(base, entry.name);

		let stale = false;
		if (RUN_ROOT_NAME_PATTERN.test(entry.name)) {
			const state = await checkRoot(dir);
			stale = state === "dead" || (state === "unknown" && (await olderThan(dir, STALE_ROOT_AGE_MS)));
		} else if (LEGACY_RUN_ROOT_NAME_PATTERN.test(entry.name)) {
			stale = await olderThan(dir, STALE_LEGACY_ROOT_AGE_MS);
		}

		if (stale) await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
	}
}

/**
 * A run's scratch root and the liveness hold on it.
 *
 * @typedef {Object} RunScratchRoot
 * @property {string} root - The root's path.
 * @property {() => Promise<void>} release - Stops holding the root (socket and heartbeat). Idempotent.
 */

/**
 * Create this run's scratch root, `<cwd>/<scratchDir>/<16 hex>/`, and hold it: a liveness
 * socket other runs' sweepers can check, plus a heartbeat that keeps its modification time
 * fresh for when there's no socket. Both stop when the process exits, however it exits.
 *
 * @param {string} cwd - Project root.
 * @param {string} scratchDir - Scratch base directory, relative to `cwd` (or absolute).
 * @returns {Promise<RunScratchRoot>}
 */
export async function createRunScratchRoot(cwd, scratchDir) {
	const base = path.resolve(cwd, scratchDir);
	const root = path.join(base, randomBytes(8).toString("hex"));
	await fs.mkdir(root, { recursive: true });

	let holder = null;
	try {
		holder = await alive.hold(root);
	} catch {
		// No socket (path over the Unix socket limit, or a filesystem without sockets): the
		// sweeper falls back to the root's age, which the heartbeat keeps fresh.
	}
	const heartbeat = setInterval(() => {
		const now = new Date();
		fs.utimes(root, now, now).catch(() => {});
	}, HEARTBEAT_MS);
	heartbeat.unref();

	let released = null;
	const release = () => {
		released ??= (async () => {
			clearInterval(heartbeat);
			await holder?.close().catch(() => {});
		})();
		return released;
	};
	return { root, release };
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
