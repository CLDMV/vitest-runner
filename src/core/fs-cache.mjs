/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /src/core/fs-cache.mjs
 *	@Date: 2026-10-26T00:00:00-07:00 (1792998000)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-10-26T06:46:29-07:00 (1793022389)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * @fileoverview Vitest `fsModuleCache` handling for parallel child processes.
 *
 * Vitest 5 caches transformed modules on disk. By default the cache lives at
 * `<workspace root>/node_modules/.vitest-cache`, shared by every package in a
 * workspace. Every vitest process compares the lockfile hash stored in that
 * cache with the current lockfile on startup and deletes the whole directory
 * when they differ. Several processes doing that at once race each other and
 * fail with `ENOTEMPTY`.
 *
 * This module gives each package its own cache directory and runs one short
 * warm-up process before the worker pool, so the lockfile check (and any
 * clear) happens exactly once per run.
 *
 * @module vitest-runner/src/core/fs-cache
 */

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { buildNodeOptions } from "../utils/env.mjs";

/** Cache directory, relative to `cwd`, used when nothing else sets one. */
export const DEFAULT_FS_MODULE_CACHE_DIR = "node_modules/.vitest-cache";

/**
 * Whether the vitest passthrough args already choose the cache location.
 * @param {string[]} vitestArgs
 * @returns {boolean}
 */
function argsSetCachePath(vitestArgs) {
	return vitestArgs.some((a) => a === "--fsModuleCachePath" || a.startsWith("--fsModuleCachePath="));
}

/**
 * Whether the vitest config file sets `fsModuleCachePath` itself.
 *
 * A text check rather than loading the config: loading would run the config's
 * own code (plugins, top-level side effects) in the runner process. A match in
 * a comment only makes the runner step aside, which is the safe direction.
 *
 * @param {string|undefined} vitestConfig - Absolute config path, if any.
 * @returns {Promise<boolean>}
 */
async function configSetsCachePath(vitestConfig) {
	if (!vitestConfig) return false;
	try {
		const source = await fs.readFile(vitestConfig, "utf8");
		return /\bfsModuleCachePath\b/.test(source);
	} catch {
		return false;
	}
}

/**
 * Work out the `--fsModuleCachePath` argument for every vitest child.
 *
 * Returns `[]` (leaving vitest's own setting alone) when:
 * - `fsModuleCachePath` is `false`,
 * - the passthrough args already include `--fsModuleCachePath`, or
 * - the vitest config file sets `fsModuleCachePath`.
 *
 * Otherwise points the cache at `fsModuleCachePath` (resolved against `cwd`),
 * or at `<cwd>/node_modules/.vitest-cache` by default.
 *
 * @param {Object} opts
 * @param {string} opts.cwd - Project root.
 * @param {string[]} [opts.vitestArgs=[]] - Vitest passthrough args.
 * @param {string|undefined} [opts.vitestConfig] - Absolute vitest config path.
 * @param {string|false|undefined} [opts.fsModuleCachePath] - Runner option.
 * @returns {Promise<string[]>}
 * @example
 * await resolveFsModuleCacheArgs({ cwd: '/repo/packages/a' });
 * // ['--fsModuleCachePath=/repo/packages/a/node_modules/.vitest-cache']
 */
export async function resolveFsModuleCacheArgs({ cwd, vitestArgs = [], vitestConfig, fsModuleCachePath }) {
	if (fsModuleCachePath === false) return [];
	if (argsSetCachePath(vitestArgs)) return [];
	if (typeof fsModuleCachePath === "string") {
		return [`--fsModuleCachePath=${path.resolve(cwd, fsModuleCachePath)}`];
	}
	if (await configSetsCachePath(vitestConfig)) return [];
	return [`--fsModuleCachePath=${path.resolve(cwd, DEFAULT_FS_MODULE_CACHE_DIR)}`];
}

/**
 * Pick out the passthrough args that affect the fs module cache, so the
 * warm-up checks the same cache the workers will use.
 * @param {string[]} vitestArgs
 * @returns {string[]}
 */
function cacheRelatedArgs(vitestArgs) {
	const picked = [];
	for (let i = 0; i < vitestArgs.length; i++) {
		const arg = vitestArgs[i];
		if (!arg.startsWith("--fsModuleCache") && !arg.startsWith("--no-fsModuleCache")) continue;
		picked.push(arg);
		// A bare flag may carry its value as the next token (see cli/args.mjs).
		const next = vitestArgs[i + 1];
		if (!arg.includes("=") && next !== undefined && !next.startsWith("-")) picked.push(vitestArgs[++i]);
	}
	return picked;
}

/**
 * Run one short vitest process so the fs module cache matches the lockfile
 * before the parallel workers start.
 *
 * Runs `vitest list --filesOnly <file>`. Vitest's startup does the lockfile
 * check (and clears a stale cache) before it lists anything, and listing with
 * `--filesOnly` doesn't transform test files. The exit code is ignored: a real
 * problem (bad config, missing file) surfaces in the actual test runs.
 *
 * @param {Object} opts
 * @param {string} opts.cwd
 * @param {string} opts.vitestBin
 * @param {string|undefined} opts.vitestConfig
 * @param {string} opts.filePath - A test file to list (keeps the run cheap and non-empty).
 * @param {string[]} [opts.vitestArgs=[]] - Passthrough args; only the cache-related ones are used.
 * @param {string[]} [opts.cacheArgs=[]] - Output of {@link resolveFsModuleCacheArgs}.
 * @param {string[]} [opts.conditions=[]]
 * @param {string} [opts.nodeEnv='development']
 * @returns {Promise<number>} The warm-up process's exit code.
 */
export function warmFsModuleCache({
	cwd,
	vitestBin,
	vitestConfig,
	filePath,
	vitestArgs = [],
	cacheArgs = [],
	conditions = [],
	nodeEnv = "development"
}) {
	return new Promise((resolve) => {
		const configArgs = vitestConfig ? ["--config", vitestConfig] : [];
		const args = [vitestBin, ...configArgs, "list", "--filesOnly", ...cacheRelatedArgs(vitestArgs), ...cacheArgs, filePath];

		const env = { ...process.env };
		if (!env.NODE_ENV) env.NODE_ENV = nodeEnv;
		const nodeOptions = buildNodeOptions({ maxOldSpaceMb: undefined, conditions, base: env.NODE_OPTIONS ?? "" });
		if (nodeOptions) env.NODE_OPTIONS = nodeOptions;

		const child = spawn(process.execPath, args, { cwd, stdio: "ignore", env });
		child.on("close", (code) => resolve(code ?? 1));
		child.on("error", () => resolve(1));
	});
}
