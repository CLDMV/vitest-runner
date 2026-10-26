/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/core/fs-cache.test.vitest.mjs
 *	@Date: 2026-10-26T00:00:00-07:00 (1792998000)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-10-26T07:12:07-07:00 (1793023927)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * @fileoverview Tests for core/fs-cache.mjs and its use in run().
 *
 * The warm-up and run() tests spawn real vitest processes with `--fsModuleCache`
 * on and the cache pointed into a throwaway directory, then plant stale
 * metadata (a lockfile hash that can't match) to simulate a lockfile change.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveFsModuleCacheArgs, warmFsModuleCache, DEFAULT_FS_MODULE_CACHE_DIR } from "../../src/core/fs-cache.mjs";
import { resolveBin } from "../../src/utils/resolve.mjs";
import { run } from "../../src/runner.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "../..");
const FIXTURES = path.join(PKG_ROOT, "tests", "fixtures");
const FIXTURE_CONFIG = path.join(FIXTURES, "vitest.config.mjs");
const CACHE_FIXTURES = path.join(FIXTURES, "fs-cache");
const VITEST_BIN = resolveBin(PKG_ROOT, "vitest");
const PROBE = pathToFileURL(path.join(FIXTURES, "fs-cache-probe.mjs")).href;
const TMP_ROOT = path.join(PKG_ROOT, "tmp", "fs-cache-tests");

/**
 * Create a fresh scratch directory for one test.
 * @param {string} label
 * @returns {Promise<string>}
 */
async function makeTmp(label) {
	await fs.mkdir(TMP_ROOT, { recursive: true });
	return fs.mkdtemp(path.join(TMP_ROOT, `${label}-`));
}

const STALE_METADATA = JSON.stringify({ lockfileHash: "stale000" });

/**
 * Create a cache directory that looks like it was written before a lockfile change.
 * @param {string} cacheDir
 * @returns {Promise<string>} Path of a sentinel file that a clear removes.
 */
async function plantStaleCache(cacheDir) {
	await fs.mkdir(cacheDir, { recursive: true });
	await fs.writeFile(path.join(cacheDir, "_metadata.json"), STALE_METADATA);
	// A few entries so a concurrent recursive rm has something to race over.
	await Promise.all(Array.from({ length: 4000 }, (_, i) => fs.writeFile(path.join(cacheDir, `entry-${i}`), "x")));
	const sentinel = path.join(cacheDir, "sentinel-from-before-the-lockfile-change");
	await fs.writeFile(sentinel, "stale");
	return sentinel;
}

describe("resolveFsModuleCacheArgs()", () => {
	let tmp;

	beforeEach(async () => {
		tmp = await makeTmp("args");
	});

	afterEach(async () => {
		await fs.rm(tmp, { recursive: true, force: true });
	});

	it("defaults to <cwd>/node_modules/.vitest-cache", async () => {
		const args = await resolveFsModuleCacheArgs({ cwd: tmp });
		expect(args).toEqual([`--fsModuleCachePath=${path.join(tmp, DEFAULT_FS_MODULE_CACHE_DIR)}`]);
	});

	it("gives sibling packages of one workspace separate cache directories", async () => {
		const [a] = await resolveFsModuleCacheArgs({ cwd: path.join(tmp, "packages", "a") });
		const [b] = await resolveFsModuleCacheArgs({ cwd: path.join(tmp, "packages", "b") });
		expect(a).toBe(`--fsModuleCachePath=${path.join(tmp, "packages", "a", "node_modules", ".vitest-cache")}`);
		expect(b).toBe(`--fsModuleCachePath=${path.join(tmp, "packages", "b", "node_modules", ".vitest-cache")}`);
	});

	it("resolves a relative fsModuleCachePath option against cwd", async () => {
		const args = await resolveFsModuleCacheArgs({ cwd: tmp, fsModuleCachePath: ".cache/vitest" });
		expect(args).toEqual([`--fsModuleCachePath=${path.join(tmp, ".cache", "vitest")}`]);
	});

	it("keeps an absolute fsModuleCachePath option as-is", async () => {
		const abs = path.join(tmp, "elsewhere");
		const args = await resolveFsModuleCacheArgs({ cwd: path.join(tmp, "pkg"), fsModuleCachePath: abs });
		expect(args).toEqual([`--fsModuleCachePath=${abs}`]);
	});

	it("adds nothing when fsModuleCachePath is false", async () => {
		expect(await resolveFsModuleCacheArgs({ cwd: tmp, fsModuleCachePath: false })).toEqual([]);
	});

	it("adds nothing when the passthrough args set --fsModuleCachePath", async () => {
		expect(await resolveFsModuleCacheArgs({ cwd: tmp, vitestArgs: ["--fsModuleCachePath", "x"] })).toEqual([]);
		expect(await resolveFsModuleCacheArgs({ cwd: tmp, vitestArgs: ["--fsModuleCachePath=x"] })).toEqual([]);
		// The passthrough wins over the runner option too.
		expect(await resolveFsModuleCacheArgs({ cwd: tmp, vitestArgs: ["--fsModuleCachePath=x"], fsModuleCachePath: "y" })).toEqual([]);
	});

	it("keeps a repo's own fsModuleCachePath from its vitest config", async () => {
		const config = path.join(tmp, "vitest.config.mjs");
		await fs.writeFile(config, 'export default { test: { fsModuleCachePath: ".my-cache" } };\n');
		expect(await resolveFsModuleCacheArgs({ cwd: tmp, vitestConfig: config })).toEqual([]);
	});

	it("still sets the path when the config doesn't mention fsModuleCachePath", async () => {
		const config = path.join(tmp, "vitest.config.mjs");
		await fs.writeFile(config, "export default { test: { fsModuleCache: true } };\n");
		const args = await resolveFsModuleCacheArgs({ cwd: tmp, vitestConfig: config });
		expect(args).toEqual([`--fsModuleCachePath=${path.join(tmp, DEFAULT_FS_MODULE_CACHE_DIR)}`]);
	});

	it("treats an unreadable config path as not setting the path", async () => {
		const args = await resolveFsModuleCacheArgs({ cwd: tmp, vitestConfig: path.join(tmp, "missing.config.mjs") });
		expect(args).toEqual([`--fsModuleCachePath=${path.join(tmp, DEFAULT_FS_MODULE_CACHE_DIR)}`]);
	});
});

describe("warmFsModuleCache()", () => {
	let tmp;

	beforeEach(async () => {
		tmp = await makeTmp("warm");
	});

	afterEach(async () => {
		await fs.rm(tmp, { recursive: true, force: true });
	});

	it("clears a cache whose lockfile hash is stale and records the current hash", async () => {
		const cacheDir = path.join(tmp, "cache");
		const sentinel = await plantStaleCache(cacheDir);

		const code = await warmFsModuleCache({
			cwd: PKG_ROOT,
			vitestBin: VITEST_BIN,
			vitestConfig: FIXTURE_CONFIG,
			filePath: path.join(CACHE_FIXTURES, "c1.test.vitest.mjs"),
			vitestArgs: ["--reporter=verbose", "--fsModuleCache"],
			cacheArgs: [`--fsModuleCachePath=${cacheDir}`],
			conditions: ["vitest-runner-dev"]
		});

		expect(code).toBe(0);
		expect(existsSync(sentinel)).toBe(false);
		const metadata = JSON.parse(await fs.readFile(path.join(cacheDir, "_metadata.json"), "utf8"));
		expect(metadata.lockfileHash).not.toBe("stale000");
	});

	it("forwards a passthrough --fsModuleCachePath given as a separate value token", async () => {
		const cacheDir = path.join(tmp, "passthrough-cache");
		const sentinel = await plantStaleCache(cacheDir);

		const code = await warmFsModuleCache({
			cwd: PKG_ROOT,
			vitestBin: VITEST_BIN,
			vitestConfig: FIXTURE_CONFIG,
			filePath: path.join(CACHE_FIXTURES, "c1.test.vitest.mjs"),
			vitestArgs: ["--fsModuleCache", "--fsModuleCachePath", cacheDir]
		});

		expect(code).toBe(0);
		expect(existsSync(sentinel)).toBe(false);
	});

	it("sets NODE_ENV from nodeEnv when the parent has none", async () => {
		// Stand-in vitest binary: exits 0 only if it was given the expected NODE_ENV.
		const fakeBin = path.join(tmp, "node-env-check.mjs");
		await fs.writeFile(fakeBin, 'process.exit(process.env.NODE_ENV === "production" ? 0 : 3);\n');
		const saved = process.env.NODE_ENV;
		delete process.env.NODE_ENV;
		try {
			const code = await warmFsModuleCache({ cwd: tmp, vitestBin: fakeBin, vitestConfig: undefined, filePath: "x", nodeEnv: "production" });
			expect(code).toBe(0);
		} finally {
			process.env.NODE_ENV = saved;
		}
	});

	it("resolves 1 when the process is killed by a signal", async () => {
		const code = await warmFsModuleCache({
			cwd: PKG_ROOT,
			vitestBin: path.join(FIXTURES, "signal-exit", "signal-self.mjs"),
			vitestConfig: undefined,
			filePath: "x"
		});
		expect(code).toBe(1);
	});

	it("resolves 1 when the process cannot be spawned", async () => {
		const code = await warmFsModuleCache({
			cwd: path.join(tmp, "does-not-exist"),
			vitestBin: VITEST_BIN,
			vitestConfig: undefined,
			filePath: "x.test.vitest.mjs"
		});
		expect(code).toBe(1);
	});
});

describe("run() — parallel workers after a lockfile change", () => {
	let tmp;
	let savedEnv;

	beforeEach(async () => {
		tmp = await makeTmp("run");
		savedEnv = { ...process.env };
	});

	afterEach(async () => {
		process.env = savedEnv;
		await fs.rm(tmp, { recursive: true, force: true });
	});

	it("starts 4 workers without a startup error and clears the cache once, before they start", async () => {
		const cacheDir = path.join(tmp, "cache");
		const probeLog = path.join(tmp, "clears.log");
		const sentinel = await plantStaleCache(cacheDir);

		// Children inherit this env; the probe logs each process that clears cacheDir.
		process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ""} --import=${PROBE}`.trim();
		process.env.FS_CACHE_PROBE_DIR = cacheDir;
		process.env.FS_CACHE_PROBE_LOG = probeLog;

		const report = await run({
			cwd: PKG_ROOT,
			testDir: CACHE_FIXTURES,
			vitestConfig: FIXTURE_CONFIG,
			vitestArgs: ["--fsModuleCache"],
			fsModuleCachePath: cacheDir,
			workers: 4,
			json: true
		});

		expect(report.exitCode).toBe(0);
		expect(report.results.all).toHaveLength(6);
		for (const result of report.results.all) {
			expect(result.rawOutput).not.toMatch(/ENOTEMPTY|Startup Error/);
		}
		expect(existsSync(sentinel)).toBe(false);
		const clears = (await fs.readFile(probeLog, "utf8")).trim().split("\n");
		expect(clears).toHaveLength(1);
	}, 120_000);
});
