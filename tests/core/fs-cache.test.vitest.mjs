/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/core/fs-cache.test.vitest.mjs
 *	@Date: 2026-10-26T00:00:00-07:00 (1792998000)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-10-26T10:14:22-07:00 (1793034862)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * @fileoverview Tests for core/fs-cache.mjs and its use in run().
 *
 * planFsModuleCache() and warmFsModuleCache() are called in-process with this
 * repo's own `vitest/node` against small config files written per test. They
 * resolve from `process.cwd()` like the workers do, so these calls pass `--root`.
 * prepareFsModuleCache() and run() start the real helper process. The default
 * for `fsModuleCache` differs between Vitest 5 releases (off in 5.0.3, on in
 * 5.0.5), so every config sets it explicitly.
 */
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as vitestNode from "vitest/node";
import { planFsModuleCache, warmFsModuleCache, prepareFsModuleCache, DEFAULT_FS_MODULE_CACHE_DIR } from "../../src/core/fs-cache.mjs";
import { run } from "../../src/index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "../..");
const FIXTURES = path.join(PKG_ROOT, "tests", "fixtures");
const FIXTURE_CONFIG = path.join(FIXTURES, "vitest.config.mjs");
const CACHE_FIXTURES = path.join(FIXTURES, "fs-cache");
const PROBE = pathToFileURL(path.join(FIXTURES, "fs-cache-probe.mjs")).href;
const TMP_ROOT = path.join(PKG_ROOT, "tmp", "fs-cache-tests");

const STALE_METADATA = JSON.stringify({ lockfileHash: "stale000" });
const ENABLED = "export default { test: { fsModuleCache: true } };\n";
const DISABLED = "export default { test: { fsModuleCache: false } };\n";

/**
 * Write a file, creating its directory.
 * @param {string} file
 * @param {string} content
 * @returns {Promise<string>} The file path.
 */
async function write(file, content) {
	await fs.mkdir(path.dirname(file), { recursive: true });
	await fs.writeFile(file, content);
	return file;
}

/**
 * The default cache arg for a package directory.
 * @param {string} cwd
 * @returns {string[]}
 */
const defaultArgs = (cwd) => [`--fsModuleCachePath=${path.join(cwd, DEFAULT_FS_MODULE_CACHE_DIR)}`];

/**
 * Create a cache directory that looks like it was written before a lockfile change.
 * @param {string} cacheDir
 * @returns {Promise<string>} Path of a sentinel file that a clear removes.
 */
async function plantStaleCache(cacheDir) {
	await fs.mkdir(cacheDir, { recursive: true });
	await fs.writeFile(path.join(cacheDir, "_metadata.json"), STALE_METADATA);
	// Enough entries that concurrent clears overlap, as with a real cache.
	await Promise.all(Array.from({ length: 4000 }, (_, i) => fs.writeFile(path.join(cacheDir, `entry-${i}`), "x")));
	const sentinel = path.join(cacheDir, "sentinel-from-before-the-lockfile-change");
	await fs.writeFile(sentinel, "stale");
	return sentinel;
}

let tmp;

beforeEach(async () => {
	await fs.mkdir(TMP_ROOT, { recursive: true });
	tmp = await fs.mkdtemp(path.join(TMP_ROOT, "case-"));
});

afterEach(async () => {
	vi.unstubAllEnvs();
	await fs.rm(tmp, { recursive: true, force: true });
});

afterAll(async () => {
	await fs.rm(TMP_ROOT, { recursive: true, force: true });
});

describe("planFsModuleCache()", () => {
	/**
	 * Plan for a package directory containing the given vitest config.
	 * @param {string} config - Config file source.
	 * @param {Object} [opts]
	 * @returns {Promise<import('../../src/core/fs-cache.mjs').FsModuleCachePlan>}
	 */
	const planFor = async (config, { dir = tmp, args = [], fsModuleCachePath } = {}) => {
		const configFile = await write(path.join(dir, "vitest.config.mjs"), config);
		return planFsModuleCache(vitestNode, { cwd: dir, args: ["--root", dir, "--config", configFile, ...args], fsModuleCachePath });
	};

	it("points the cache at <cwd>/node_modules/.vitest-cache by default", async () => {
		expect(await planFor(ENABLED)).toEqual({ cacheEnabled: true, cacheArgs: defaultArgs(tmp) });
	});

	it("gives sibling packages of one workspace separate cache directories", async () => {
		const a = path.join(tmp, "packages", "a");
		const b = path.join(tmp, "packages", "b");
		expect((await planFor(ENABLED, { dir: a })).cacheArgs).toEqual(defaultArgs(a));
		expect((await planFor(ENABLED, { dir: b })).cacheArgs).toEqual(defaultArgs(b));
	});

	it("adds nothing when the cache is off", async () => {
		expect(await planFor(DISABLED)).toEqual({ cacheEnabled: false, cacheArgs: [] });
		expect(await planFor(ENABLED, { args: ["--fsModuleCache=false"] })).toEqual({ cacheEnabled: false, cacheArgs: [] });
	});

	it("keeps a path set in the root config", async () => {
		const plan = await planFor('export default { test: { fsModuleCache: true, fsModuleCachePath: ".my-cache" } };\n');
		expect(plan).toEqual({ cacheEnabled: true, cacheArgs: [] });
	});

	it("keeps a path set in one project's own config", async () => {
		await write(
			path.join(tmp, "packages", "a", "vitest.config.mjs"),
			'export default { test: { name: "a", fsModuleCache: true, fsModuleCachePath: ".a-cache" } };\n'
		);
		await write(path.join(tmp, "packages", "b", "vitest.config.mjs"), 'export default { test: { name: "b", fsModuleCache: true } };\n');
		const plan = await planFor('export default { test: { projects: ["packages/*"] } };\n');
		expect(plan).toEqual({ cacheEnabled: true, cacheArgs: [] });
	});

	it("keeps a path that the config pulls in from a shared file", async () => {
		await write(path.join(tmp, "shared.mjs"), 'export default { test: { fsModuleCache: true, fsModuleCachePath: ".shared-cache" } };\n');
		const plan = await planFor(
			'import { mergeConfig } from "vitest/config";\nimport shared from "./shared.mjs";\nexport default mergeConfig(shared, { test: {} });\n'
		);
		expect(plan).toEqual({ cacheEnabled: true, cacheArgs: [] });
	});

	it("resolves the config with the passthrough args the workers get", async () => {
		const config =
			'export default ({ mode }) => ({ test: { fsModuleCache: true, ...(mode === "shared" && { fsModuleCachePath: ".x" }) } });\n';
		expect((await planFor(config)).cacheArgs).toEqual(defaultArgs(tmp));
		expect((await planFor(config, { args: ["--mode", "shared"] })).cacheArgs).toEqual([]);
	});

	it("uses the fsModuleCachePath option over a path in the config", async () => {
		const plan = await planFor('export default { test: { fsModuleCache: true, fsModuleCachePath: ".my-cache" } };\n', {
			fsModuleCachePath: ".runner-cache"
		});
		expect(plan.cacheArgs).toEqual([`--fsModuleCachePath=${path.join(tmp, ".runner-cache")}`]);
	});

	it("adds nothing when the fsModuleCachePath option is false", async () => {
		expect(await planFor(ENABLED, { fsModuleCachePath: false })).toEqual({ cacheEnabled: true, cacheArgs: [] });
	});

	it("leaves a --fsModuleCachePath passthrough arg alone, even over the option", async () => {
		const elsewhere = path.join(tmp, "elsewhere");
		expect((await planFor(ENABLED, { args: ["--fsModuleCachePath", elsewhere] })).cacheArgs).toEqual([]);
		expect((await planFor(ENABLED, { args: [`--fsModuleCachePath=${elsewhere}`], fsModuleCachePath: "x" })).cacheArgs).toEqual([]);
	});
});

describe("planFsModuleCache() — config shapes", () => {
	it("works when the resolved config has no project list", async () => {
		// A stand-in vitest/node whose resolveConfig returns only the root config.
		const stub = {
			parseCLI: () => ({ options: {} }),
			resolveConfig: async () => ({ test: { fsModuleCache: true } })
		};
		expect(await planFsModuleCache(stub, { cwd: tmp })).toEqual({ cacheEnabled: true, cacheArgs: defaultArgs(tmp) });
	});
});

describe("warmFsModuleCache()", () => {
	it("clears a cache whose lockfile hash is stale and records the current hash", async () => {
		const cacheDir = path.join(tmp, "cache");
		const sentinel = await plantStaleCache(cacheDir);
		const configFile = await write(path.join(tmp, "vitest.config.mjs"), ENABLED);

		await warmFsModuleCache(vitestNode, {
			args: ["--root", tmp, "--config", configFile],
			cacheArgs: [`--fsModuleCachePath=${cacheDir}`]
		});

		expect(existsSync(sentinel)).toBe(false);
		const metadata = JSON.parse(await fs.readFile(path.join(cacheDir, "_metadata.json"), "utf8"));
		expect(metadata.lockfileHash).not.toBe("stale000");
	});
});

describe("prepareFsModuleCache()", () => {
	it("returns the helper's plan without warming when not asked to", async () => {
		const vitestConfig = await write(path.join(tmp, "vitest.config.mjs"), ENABLED);
		const result = await prepareFsModuleCache({ cwd: tmp, vitestConfig });
		expect(result).toEqual({ cacheEnabled: true, cacheArgs: defaultArgs(tmp), warmed: false });
	});

	it("does the lockfile check once when asked to", async () => {
		const cacheDir = path.join(tmp, "cache");
		const sentinel = await plantStaleCache(cacheDir);
		const vitestConfig = await write(path.join(tmp, "vitest.config.mjs"), ENABLED);

		const result = await prepareFsModuleCache({ cwd: tmp, vitestConfig, fsModuleCachePath: cacheDir, warm: true });

		expect(result.warmed).toBe(true);
		expect(existsSync(sentinel)).toBe(false);
	});

	it("checks the cache directory the workers use when the config sets its own root", async () => {
		const cacheDir = path.join(tmp, "sub", ".cache");
		const sentinel = await plantStaleCache(cacheDir);
		const vitestConfig = await write(
			path.join(tmp, "vitest.config.mjs"),
			'export default { root: "sub", test: { fsModuleCache: true, fsModuleCachePath: ".cache" } };\n'
		);

		const result = await prepareFsModuleCache({ cwd: tmp, vitestConfig, warm: true });

		expect(result).toEqual({ cacheEnabled: true, cacheArgs: [], warmed: true });
		expect(existsSync(sentinel)).toBe(false);
		expect(existsSync(path.join(tmp, ".cache"))).toBe(false);
	});

	it("doesn't warm when the cache is off", async () => {
		const vitestConfig = await write(path.join(tmp, "vitest.config.mjs"), DISABLED);
		expect(await prepareFsModuleCache({ cwd: tmp, vitestConfig, warm: true })).toEqual({
			cacheEnabled: false,
			cacheArgs: [],
			warmed: false
		});
	});

	it("finishes when the config leaves a handle open", async () => {
		const vitestConfig = await write(path.join(tmp, "vitest.config.mjs"), `setInterval(() => {}, 1000);\n${ENABLED}`);
		const result = await prepareFsModuleCache({ cwd: tmp, vitestConfig, warm: true });
		expect(result).toEqual({ cacheEnabled: true, cacheArgs: defaultArgs(tmp), warmed: true });
	});

	it("passes NODE_ENV from nodeEnv to the helper when the parent has none", async () => {
		vi.stubEnv("NODE_ENV", undefined);
		const vitestConfig = await write(
			path.join(tmp, "vitest.config.mjs"),
			'export default { test: { fsModuleCache: process.env.NODE_ENV === "production" } };\n'
		);
		const result = await prepareFsModuleCache({ cwd: tmp, vitestConfig, nodeEnv: "production" });
		expect(result.cacheEnabled).toBe(true);
	});

	it("adds nothing when the config fails to load", async () => {
		const vitestConfig = await write(path.join(tmp, "vitest.config.mjs"), 'throw new Error("broken config");\n');
		const result = await prepareFsModuleCache({ cwd: tmp, vitestConfig, warm: true });
		expect(result).toMatchObject({ cacheArgs: [], warmed: false });
		expect(result.error).toMatch(/broken config/);
	});

	it("kills the helper and adds nothing when it doesn't finish in time", async () => {
		const vitestConfig = await write(
			path.join(tmp, "vitest.config.mjs"),
			`await new Promise(() => setInterval(() => {}, 1000));\n${ENABLED}`
		);
		const result = await prepareFsModuleCache({ cwd: tmp, vitestConfig, timeoutMs: 1500 });
		expect(result).toMatchObject({ cacheArgs: [], warmed: false });
		expect(result.error).toMatch(/without a result/);
	});

	it("adds nothing when the helper can't be started", async () => {
		const result = await prepareFsModuleCache({ cwd: path.join(tmp, "does-not-exist"), vitestConfig: undefined });
		expect(result).toMatchObject({ cacheArgs: [], warmed: false });
		expect(result.error).toBeTruthy();
	});

	it("skips when the installed vitest can't be read", async () => {
		await write(path.join(tmp, "node_modules", "vitest", "package.json"), "not json\n");
		expect(await prepareFsModuleCache({ cwd: tmp, vitestConfig: undefined, warm: true })).toEqual({
			cacheEnabled: false,
			cacheArgs: [],
			warmed: false
		});
	});

	it("skips vitest older than 5 without starting the helper", async () => {
		await write(path.join(tmp, "node_modules", "vitest", "package.json"), '{ "name": "vitest", "version": "4.1.0" }\n');
		expect(await prepareFsModuleCache({ cwd: tmp, vitestConfig: undefined, warm: true })).toEqual({
			cacheEnabled: false,
			cacheArgs: [],
			warmed: false
		});
	});
});

describe("run() — helper failure", () => {
	it("warns and runs the files anyway when the helper fails", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.spyOn(console, "log").mockImplementation(() => {});
		// Fails only inside the helper process, so the workers still run.
		const vitestConfig = await write(
			path.join(tmp, "vitest.config.mjs"),
			'if (process.argv[1]?.endsWith("fs-cache-helper.mjs")) throw new Error("helper-only failure");\n' +
				'export default { test: { include: ["tests/fixtures/fs-cache/**/*.test.vitest.mjs"] } };\n'
		);

		const code = await run({ cwd: PKG_ROOT, testDir: CACHE_FIXTURES, vitestConfig, workers: 2, suppressFileOutput: true });

		expect(code).toBe(0);
		expect(warn).toHaveBeenCalledWith(expect.stringMatching(/module cache setup skipped \(helper-only failure\)/));
		vi.restoreAllMocks();
	}, 120_000);
});

describe("run() — parallel workers after a lockfile change", () => {
	it("starts 4 workers without a startup error, with one clear done by the helper", async () => {
		const cacheDir = path.join(tmp, "cache");
		const probeLog = path.join(tmp, "clears.log");
		const sentinel = await plantStaleCache(cacheDir);

		// Children inherit these; the probe records each process that clears cacheDir.
		vi.stubEnv("NODE_OPTIONS", `${process.env.NODE_OPTIONS ?? ""} --import=${PROBE}`.trim());
		vi.stubEnv("FS_CACHE_PROBE_DIR", cacheDir);
		vi.stubEnv("FS_CACHE_PROBE_LOG", probeLog);

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
		expect(clears).toEqual(["fs-cache-helper.mjs"]);
	}, 120_000);
});
