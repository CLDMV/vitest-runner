/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /src/core/fs-cache.mjs
 *	@Date: 2026-10-26T00:00:00-07:00 (1792998000)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-10-26T08:18:12-07:00 (1793027892)
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
 * fail with `ENOTEMPTY`, and packages with different lockfiles keep clearing
 * each other's cache.
 *
 * Before the worker pool starts, the runner starts one helper process
 * (fs-cache-helper.mjs) that uses Vitest's own node API to:
 * - resolve the real config for the root and every project, and point the cache
 *   at `<cwd>/node_modules/.vitest-cache` only if none of them sets
 *   `fsModuleCachePath` itself;
 * - start Vitest once with the same args the workers get, so the lockfile check
 *   (and any clear) happens exactly once per run.
 *
 * @module vitest-runner/src/core/fs-cache
 */

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildEnv } from "../utils/env.mjs";

/** Cache directory, relative to `cwd`, used when nothing else sets one. */
export const DEFAULT_FS_MODULE_CACHE_DIR = "node_modules/.vitest-cache";

/** The helper is killed after this long; the run then goes ahead without it. */
const DEFAULT_HELPER_TIMEOUT_MS = 60_000;

/**
 * @typedef {Object} FsModuleCachePlan
 * @property {string[]} cacheArgs - Args to add to every vitest child (`[]` or one `--fsModuleCachePath=…`).
 * @property {boolean} cacheEnabled - Whether the root or any project has `fsModuleCache` on.
 */

/**
 * Whether the vitest passthrough args already choose the cache location.
 * @param {string[]} vitestArgs
 * @returns {boolean}
 */
function argsSetCachePath(vitestArgs) {
	return vitestArgs.some((a) => a === "--fsModuleCachePath" || a.startsWith("--fsModuleCachePath="));
}

/**
 * Parse vitest CLI args the way the vitest binary does for `vitest run`.
 * @param {any} vitestNode - The consumer's `vitest/node` module.
 * @param {string[]} args - Args after `vitest run` (config, passthrough, cache args).
 * @returns {object} Options for `resolveConfig` / `createVitest`.
 */
function parseRunArgs(vitestNode, args) {
	// `root` is left unset unless the args set it, exactly as for the workers: a
	// CLI root overrides `root` in the config, and the helper runs in their cwd.
	return vitestNode.parseCLI(["vitest", "run", ...args]).options;
}

/**
 * Decide the `--fsModuleCachePath` argument for every vitest child.
 *
 * Order of precedence:
 * 1. a `--fsModuleCachePath` passthrough arg — left alone, no arg added;
 * 2. the runner's `fsModuleCachePath` option — `false` adds nothing, a path is used for every child;
 * 3. `fsModuleCachePath` set anywhere in the resolved config (root or any project) — left alone;
 * 4. otherwise, when the cache is on, `<cwd>/node_modules/.vitest-cache`.
 *
 * @param {any} vitestNode - The consumer's `vitest/node` module (needs `parseCLI` and `resolveConfig`).
 * Like the workers, the config is resolved from `process.cwd()` unless the args
 * set `--root`.
 *
 * @param {Object} opts
 * @param {string} opts.cwd - Project root; relative cache paths resolve against it.
 * @param {string[]} [opts.args=[]] - Args the workers get after `vitest run` (config + passthrough).
 * @param {string|false} [opts.fsModuleCachePath] - Runner option.
 * @returns {Promise<FsModuleCachePlan>}
 */
export async function planFsModuleCache(vitestNode, { cwd, args = [], fsModuleCachePath }) {
	const viteConfig = await vitestNode.resolveConfig(parseRunArgs(vitestNode, args));
	const configs = [viteConfig.test, ...(viteConfig.test.resolvedProjects ?? []).map((entry) => entry.projectConfig)];
	const cacheEnabled = configs.some((config) => config?.fsModuleCache === true);

	let cacheArgs = [];
	if (fsModuleCachePath === false || argsSetCachePath(args)) {
		cacheArgs = [];
	} else if (typeof fsModuleCachePath === "string") {
		cacheArgs = [`--fsModuleCachePath=${path.resolve(cwd, fsModuleCachePath)}`];
	} else if (cacheEnabled && !configs.some((config) => config?.fsModuleCachePath)) {
		cacheArgs = [`--fsModuleCachePath=${path.resolve(cwd, DEFAULT_FS_MODULE_CACHE_DIR)}`];
	}

	return { cacheArgs, cacheEnabled };
}

/**
 * Start Vitest once with the workers' args and close it again.
 *
 * Creating the Vitest instance runs its startup lockfile check, which clears a
 * stale fs module cache. No tests run.
 *
 * @param {any} vitestNode - The consumer's `vitest/node` module (needs `parseCLI` and `createVitest`).
 * @param {Object} opts
 * @param {string[]} [opts.args=[]] - Args the workers get after `vitest run`.
 * @param {string[]} [opts.cacheArgs=[]] - From {@link planFsModuleCache}.
 * @returns {Promise<void>}
 */
export async function warmFsModuleCache(vitestNode, { args = [], cacheArgs = [] }) {
	const options = parseRunArgs(vitestNode, [...args, ...cacheArgs]);
	const vitest = await vitestNode.createVitest("test", { ...options, watch: false, run: true });
	await vitest.close();
}

/**
 * Read the major version of the vitest installed for `cwd`.
 * @param {string} cwd
 * @returns {number|undefined}
 */
function readVitestMajor(cwd) {
	try {
		const require = createRequire(pathToFileURL(path.join(cwd, "package.json")));
		return parseInt(require("vitest/package.json").version, 10);
	} catch {
		return undefined;
	}
}

/**
 * Plan the fs module cache for a run, and optionally do the lockfile check once,
 * in a helper process (fs-cache-helper.mjs).
 *
 * Does nothing on vitest < 5, which has no top-level `fsModuleCachePath`. When
 * the helper fails or times out, the run goes ahead as if this didn't exist:
 * no args are added.
 *
 * @param {Object} opts
 * @param {string} opts.cwd
 * @param {string|undefined} opts.vitestConfig - Absolute vitest config path, if any.
 * @param {string[]} [opts.vitestArgs=[]] - Passthrough args.
 * @param {string|false} [opts.fsModuleCachePath] - Runner option.
 * @param {boolean} [opts.warm=false] - Also do the lockfile check once.
 * @param {string[]} [opts.conditions=[]]
 * @param {string} [opts.nodeEnv='development']
 * @param {number} [opts.timeoutMs=60000] - Kill the helper after this long.
 * @returns {Promise<FsModuleCachePlan & { warmed: boolean, error?: string }>}
 */
export function prepareFsModuleCache({
	cwd,
	vitestConfig,
	vitestArgs = [],
	fsModuleCachePath,
	warm = false,
	conditions = [],
	nodeEnv = "development",
	timeoutMs = DEFAULT_HELPER_TIMEOUT_MS
}) {
	const fallback = { cacheArgs: [], cacheEnabled: false, warmed: false };
	if (!(readVitestMajor(cwd) >= 5)) return Promise.resolve(fallback);

	return new Promise((resolve) => {
		const args = [...(vitestConfig ? ["--config", vitestConfig] : []), ...vitestArgs];
		const payload = JSON.stringify({ cwd, args, fsModuleCachePath, warm });
		const helper = fileURLToPath(new URL("./fs-cache-helper.mjs", import.meta.url));

		const env = buildEnv({ conditions, nodeEnv });

		const child = spawn(process.execPath, [helper, payload], { cwd, stdio: ["ignore", "pipe", "ignore"], env });

		let stdout = "";
		child.stdout.on("data", (data) => (stdout += data.toString()));

		const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);

		child.on("close", () => {
			clearTimeout(timer);
			const lastLine = stdout.trim().split("\n").pop();
			try {
				const result = JSON.parse(lastLine);
				resolve(result.error ? { ...fallback, error: result.error } : { ...fallback, ...result });
			} catch {
				resolve({ ...fallback, error: "fs module cache helper exited without a result" });
			}
		});
		child.on("error", (err) => {
			clearTimeout(timer);
			resolve({ ...fallback, error: err.message });
		});
	});
}
