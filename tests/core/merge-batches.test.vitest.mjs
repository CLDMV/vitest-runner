/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/core/merge-batches.test.vitest.mjs
 *	@Date: 2026-11-21T11:55:38-08:00 (1795290938)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-21T11:56:13-08:00 (1795290973)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * @fileoverview Tests for the batched coverage merge (src/core/merge-batches.mjs and
 * runMergeReports in src/core/spawn.mjs).
 *
 * Real blobs are generated once from the fixture project in
 * tests/fixtures/merge-batches/ (5 passing files in cases/, 1 failing file in red/).
 * Each batched merge (batch size 2 → 2+ reduction rounds) is compared against the
 * single `vitest --mergeReports` over the same blobs: coverage-final.json,
 * coverage-summary.json totals, the test-count lines and the exit code must match.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run, runMergeReports, resolveBin, stripAnsi } from "@cldmv/vitest-runner";
import {
	DEFAULT_MERGE_BATCH_SIZE,
	EnvironmentModulesAccumulator,
	UnsupportedBlobError,
	assertBlobShape,
	chunk,
	findVitestPackage,
	isSupportedVitestVersion,
	loadBlobLibraries,
	reduceBlobFiles,
	reduceBlobsInBatches,
	resolveMergeBatchSize
} from "../../src/core/merge-batches.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "../..");
const FIXTURE = path.join(PKG_ROOT, "tests", "fixtures", "merge-batches");
const CONFIG = path.join(FIXTURE, "vitest.config.mjs");
const WORK = path.join(PKG_ROOT, "tmp", `merge-batches-tests-${process.pid}`);
const vitestBin = resolveBin(PKG_ROOT, "vitest", "vitest");
const vitestPkg = findVitestPackage(vitestBin);

/**
 * Run the fixture files with the blob reporter and leave the blobs in a directory.
 * @param {string} name
 * @param {string} testDir
 * @returns {Promise<string>} blobs directory
 */
async function makeBlobs(name, testDir) {
	const blobsDir = path.join(WORK, name, "blobs");
	await run({
		cwd: FIXTURE,
		testDir,
		vitestConfig: CONFIG,
		vitestArgs: ["--coverage"],
		mergeReports: false,
		blobsDir,
		json: true,
		// One file at a time keeps this file's CPU load low next to the rest of the suite.
		workers: 1,
		fsModuleCachePath: false,
		scratchDir: path.join(WORK, name, "run-scratch")
	});
	return blobsDir;
}

/**
 * Merge `blobsDir` into `<WORK>/<name>/coverage`.
 * @param {string} blobsDir
 * @param {string} name
 * @param {Object} [extra]
 * @returns {Promise<{ exitCode: number, output: string, coverageDir: string }>}
 */
async function merge(blobsDir, name, extra = {}) {
	const coverageDir = path.join(WORK, name, "coverage");
	const result = await runMergeReports(blobsDir, {
		cwd: FIXTURE,
		vitestBin,
		vitestConfig: CONFIG,
		quietOutput: true,
		extraCoverageArgs: [`--coverage.reportsDirectory=${coverageDir}`],
		...extra
	});
	return { ...result, coverageDir };
}

/** @param {string} dir */
const readJson = async (dir, file) => JSON.parse(await fs.readFile(path.join(dir, file), "utf-8"));

/** The "Test Files" / "Tests" summary lines of a merge's output. */
const countLines = (output) =>
	stripAnsi(output)
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => /^(Test Files|Tests)\s/.test(l));

/** @param {string} p */
const exists = (p) =>
	fs.access(p).then(
		() => true,
		() => false
	);

let greenBlobs;
let mixedBlobs;

beforeAll(async () => {
	await fs.rm(WORK, { recursive: true, force: true });
	await fs.mkdir(WORK, { recursive: true });
	greenBlobs = await makeBlobs("green", path.join(FIXTURE, "cases"));
	// mixed = the 5 green blobs + the failing file's blob, without re-running the green files.
	const redBlobs = await makeBlobs("red", path.join(FIXTURE, "red"));
	mixedBlobs = path.join(WORK, "mixed", "blobs");
	await fs.mkdir(mixedBlobs, { recursive: true });
	for (const name of await fs.readdir(greenBlobs)) await fs.copyFile(path.join(greenBlobs, name), path.join(mixedBlobs, name));
	for (const name of await fs.readdir(redBlobs)) await fs.copyFile(path.join(redBlobs, name), path.join(mixedBlobs, `red-${name}`));
}, 180_000);

afterAll(async () => {
	await fs.rm(WORK, { recursive: true, force: true });
});

describe("fixture blobs", () => {
	it("produced one blob per fixture file", async () => {
		expect(await fs.readdir(greenBlobs)).toHaveLength(5);
		expect(await fs.readdir(mixedBlobs)).toHaveLength(6);
	});
});

describe("runMergeReports — batched merge matches the single merge", () => {
	it("passing blobs: same coverage, same counts, exit 0", async () => {
		const single = await merge(greenBlobs, "green-single", { batchSize: 0 });
		const scratchDir = path.join(WORK, "green-batched", "scratch");
		const batched = await merge(greenBlobs, "green-batched", { batchSize: 2, scratchDir });

		expect(single.exitCode).toBe(0);
		expect(batched.exitCode).toBe(0);
		expect(batched.output).toContain("Reduced 5 blobs to 2 in 2 round(s)");
		expect(single.output).not.toContain("Reduced");

		const singleFinal = await readJson(single.coverageDir, "coverage-final.json");
		expect(
			Object.keys(singleFinal)
				.map((f) => path.basename(f))
				.sort()
		).toEqual(["calc.mjs", "text.mjs"]);
		expect(await readJson(batched.coverageDir, "coverage-final.json")).toEqual(singleFinal);

		const singleSummary = await readJson(single.coverageDir, "coverage-summary.json");
		const batchedSummary = await readJson(batched.coverageDir, "coverage-summary.json");
		expect(singleSummary.total.statements.covered).toBeGreaterThan(0);
		expect(batchedSummary.total).toEqual(singleSummary.total);
		expect(batchedSummary).toEqual(singleSummary);

		expect(countLines(single.output)).toHaveLength(2);
		expect(countLines(batched.output)).toEqual(countLines(single.output));

		// The reduction's scratch is gone; the input blobs are untouched.
		expect(await exists(scratchDir)).toBe(false);
		expect(await fs.readdir(greenBlobs)).toHaveLength(5);
	}, 120_000);

	it("blobs with a failing test: same coverage, same counts, exit 1", async () => {
		const single = await merge(mixedBlobs, "mixed-single", { batchSize: 0 });
		const batched = await merge(mixedBlobs, "mixed-batched", { batchSize: 2 });

		expect(single.exitCode).toBe(1);
		expect(batched.exitCode).toBe(1);
		expect(batched.output).toContain("Reduced 6 blobs to 2 in 2 round(s)");

		expect(await readJson(batched.coverageDir, "coverage-final.json")).toEqual(await readJson(single.coverageDir, "coverage-final.json"));
		expect((await readJson(batched.coverageDir, "coverage-summary.json")).total).toEqual(
			(await readJson(single.coverageDir, "coverage-summary.json")).total
		);
		const lines = countLines(single.output);
		expect(lines.join("\n")).toMatch(/failed/);
		expect(countLines(batched.output)).toEqual(lines);

		// Default scratch (no scratchDir option) is a sibling of blobsDir and is removed too.
		const siblings = await fs.readdir(path.dirname(mixedBlobs));
		expect(siblings.filter((n) => n.includes("-merge-"))).toEqual([]);
	}, 120_000);

	it("at or below the batch size, merges once with no reduction", async () => {
		const scratchDir = path.join(WORK, "green-unbatched", "scratch");
		const result = await merge(greenBlobs, "green-unbatched", { batchSize: 5, scratchDir });
		expect(result.exitCode).toBe(0);
		expect(result.output).not.toContain("Reduced");
		expect(result.output).not.toContain("Merge round");
		expect(await exists(scratchDir)).toBe(false);
		const reference = await readJson(path.join(WORK, "green-single", "coverage"), "coverage-final.json");
		expect(await readJson(result.coverageDir, "coverage-final.json")).toEqual(reference);
	}, 120_000);

	it("prints its notes to stdout when quietOutput is false", async () => {
		const logs = [];
		const original = console.log;
		console.log = (...args) => logs.push(args.join(" "));
		let result;
		try {
			result = await runMergeReports(greenBlobs, {
				cwd: FIXTURE,
				vitestBin: path.join(PKG_ROOT, "tests", "fixtures", "signal-exit", "signal-self.mjs"),
				batchSize: 4
			});
		} finally {
			console.log = original;
		}
		// signal-self is not a vitest bin, so findVitestPackage finds no vitest above it → fallback.
		expect(result.exitCode).toBe(1);
		expect(logs.join("\n")).toContain("unknown vitest version");
	}, 60_000);
});

describe("runMergeReports — fallbacks", () => {
	it("falls back to one merge when the installed vitest is not a supported major", async () => {
		const fakeDir = path.join(WORK, "fake-vitest", "node_modules", "vitest");
		await fs.mkdir(fakeDir, { recursive: true });
		await fs.writeFile(path.join(fakeDir, "package.json"), JSON.stringify({ name: "vitest", version: "4.1.0" }));
		const argvFile = path.join(WORK, "fake-vitest", "argv.json");
		const fakeBin = path.join(fakeDir, "vitest.mjs");
		await fs.writeFile(
			fakeBin,
			`import fs from "node:fs";\nfs.writeFileSync(${JSON.stringify(argvFile)}, JSON.stringify(process.argv.slice(2)));\nprocess.exit(7);\n`
		);

		const result = await runMergeReports(greenBlobs, { cwd: FIXTURE, vitestBin: fakeBin, quietOutput: true, batchSize: 2 });
		expect(result.exitCode).toBe(7);
		expect(result.output).toContain("found vitest 4.1.0");
		const argv = JSON.parse(await fs.readFile(argvFile, "utf-8"));
		expect(argv[argv.indexOf("--mergeReports") + 1]).toBe(greenBlobs);
	});

	it("falls back to one merge when a blob doesn't have the supported layout", async () => {
		const { flatted } = await loadBlobLibraries(vitestPkg.dir);
		const dir = path.join(WORK, "odd-layout", "blobs");
		await fs.mkdir(dir, { recursive: true });
		for (const name of (await fs.readdir(greenBlobs)).slice(0, 3)) await fs.copyFile(path.join(greenBlobs, name), path.join(dir, name));
		// A 7-field blob: vitest itself would read it, the reducer refuses it.
		const [first] = await fs.readdir(dir);
		const blob = flatted.parse(await fs.readFile(path.join(dir, first), "utf-8"));
		await fs.writeFile(path.join(dir, "zz-extra.blob"), flatted.stringify([...blob, "extra field"]));

		const single = await merge(dir, "odd-single", { batchSize: 0 });
		const batched = await merge(dir, "odd-batched", { batchSize: 2 });
		expect(batched.output).toContain("blob layout not supported");
		expect(batched.output).toContain("not a 6-field blob array");
		expect(batched.exitCode).toBe(single.exitCode);
		expect(await readJson(batched.coverageDir, "coverage-final.json")).toEqual(await readJson(single.coverageDir, "coverage-final.json"));
	}, 120_000);

	it("leaves a directory with a non-file entry to vitest's own error", async () => {
		const dir = path.join(WORK, "with-subdir", "blobs");
		await fs.mkdir(path.join(dir, "nested"), { recursive: true });
		for (const name of await fs.readdir(greenBlobs)) await fs.copyFile(path.join(greenBlobs, name), path.join(dir, name));
		const result = await merge(dir, "with-subdir", { batchSize: 2 });
		expect(result.exitCode).toBe(1);
		expect(result.output).not.toContain("Reduced");
		expect(result.output).toMatch(/is not a file/);
	}, 60_000);
});

describe("run() — mergeBatchSize", () => {
	it("batches the merge of a real coverage run and reports it in the JSON merge output", async () => {
		const coverageDir = path.join(WORK, "run-batched", "coverage");
		const report = await run({
			cwd: FIXTURE,
			testDir: path.join(FIXTURE, "cases"),
			testPatterns: ["add.test", "shout.test", "initials.test"],
			vitestConfig: CONFIG,
			vitestArgs: ["--coverage", `--coverage.reportsDirectory=${coverageDir}`],
			blobsDir: path.join(WORK, "run-batched", "blobs"),
			scratchDir: path.join(WORK, "run-batched", "scratch"),
			json: true,
			workers: 1,
			fsModuleCachePath: false,
			mergeBatchSize: 2
		});
		expect(report.exitCode).toBe(0);
		expect(report.totals.testFiles).toBe(3);
		expect(report.merge.output).toContain("Reduced 3 blobs to 2 in 1 round(s)");
		const summary = await readJson(coverageDir, "coverage-summary.json");
		expect(summary.total.statements.covered).toBeGreaterThan(0);
		// run() removes its whole scratch root, which held the reduction's scratch.
		expect(await fs.readdir(path.join(WORK, "run-batched", "scratch"))).toEqual([]);
	}, 180_000);
});

describe("reduceBlobFiles (in-process)", () => {
	it("merges real blobs: files and errors concatenated, times summed, coverage merged, graphs unioned", async () => {
		const { flatted, libCoverage } = await loadBlobLibraries(vitestPkg.dir);
		const inputs = (await fs.readdir(mixedBlobs)).map((n) => path.join(mixedBlobs, n));
		const output = path.join(WORK, "in-process.blob");
		await reduceBlobFiles({ inputs, output, expectedVersion: vitestPkg.version, flatted, libCoverage });

		const parsed = await Promise.all(inputs.map(async (f) => flatted.parse(await fs.readFile(f, "utf-8"))));
		const merged = flatted.parse(await fs.readFile(output, "utf-8"));
		assertBlobShape(merged, vitestPkg.version, output);

		const [version, files, errors, coverage, executionTime, environmentModules] = merged;
		expect(version).toBe(vitestPkg.version);
		expect(files.map((f) => f.filepath).sort()).toEqual(parsed.flatMap((b) => b[1].map((f) => f.filepath)).sort());
		expect(errors).toHaveLength(parsed.reduce((n, b) => n + b[2].length, 0));
		expect(executionTime).toBeCloseTo(
			parsed.reduce((n, b) => n + b[4], 0),
			6
		);

		const expected = libCoverage.createCoverageMap({});
		for (const b of parsed) expected.merge(b[3]);
		expect(JSON.parse(JSON.stringify(libCoverage.createCoverageMap(coverage)))).toEqual(JSON.parse(JSON.stringify(expected)));

		const ids = (blobs) =>
			[
				...new Set(
					blobs.flatMap((em) =>
						Object.values(em).flatMap((p) => Object.values(p.environments).flatMap((g) => g.modules.map((m) => g.idTable[m[0]])))
					)
				)
			].sort();
		expect(ids([environmentModules])).toEqual(ids(parsed.map((b) => b[5])));
	}, 60_000);

	it("writes no coverage when no input has coverage", async () => {
		const { flatted, libCoverage } = await loadBlobLibraries(vitestPkg.dir);
		const input = path.join(WORK, "no-coverage.blob");
		await fs.writeFile(input, flatted.stringify([vitestPkg.version, [], [], undefined, 5, {}]));
		const output = path.join(WORK, "no-coverage-out.blob");
		await reduceBlobFiles({ inputs: [input, input], output, expectedVersion: vitestPkg.version, flatted, libCoverage });
		const merged = flatted.parse(await fs.readFile(output, "utf-8"));
		// undefined in an array serializes as null — same as vitest's own blob reporter.
		expect(merged[3]).toBeNull();
		expect(merged[4]).toBe(10);
	});

	it("rejects coverage that isn't an istanbul coverage map", async () => {
		const { flatted, libCoverage } = await loadBlobLibraries(vitestPkg.dir);
		const input = path.join(WORK, "bad-coverage.blob");
		await fs.writeFile(input, flatted.stringify([vitestPkg.version, [], [], { "/x.js": { nope: true } }, 1, {}]));
		await expect(
			reduceBlobFiles({
				inputs: [input],
				output: path.join(WORK, "bad-out.blob"),
				expectedVersion: vitestPkg.version,
				flatted,
				libCoverage
			})
		).rejects.toBeInstanceOf(UnsupportedBlobError);
	});
});

describe("reduceBlobsInBatches — helper failures", () => {
	/** @param {string} body */
	const helper = async (name, body) => {
		const file = path.join(WORK, `${name}.mjs`);
		await fs.writeFile(file, body);
		return file;
	};
	const baseOpts = async (name) => ({
		blobFiles: (await fs.readdir(greenBlobs)).map((n) => path.join(greenBlobs, n)),
		scratchDir: path.join(WORK, name),
		batchSize: 2,
		vitestDir: vitestPkg.dir,
		vitestVersion: vitestPkg.version,
		cwd: FIXTURE,
		maxOldSpaceMb: undefined
	});

	it("reports an unsupported layout from exit code 3 with the helper's message", async () => {
		const helperPath = await helper("exit3", `process.stdout.write(JSON.stringify({ message: "odd blob" }) + "\\n"); process.exit(3);`);
		const result = await reduceBlobsInBatches({ ...(await baseOpts("exit3-scratch")), helperPath });
		expect(result).toEqual({ ok: false, unsupported: true, message: "odd blob" });
	});

	it("reports any other failure with the helper's stderr tail", async () => {
		const helperPath = await helper("exit1", `process.stderr.write("boom: out of memory\\n"); process.exit(1);`);
		const result = await reduceBlobsInBatches({ ...(await baseOpts("exit1-scratch")), helperPath });
		expect(result).toEqual({ ok: false, unsupported: false, message: "boom: out of memory" });
	});

	it("falls back to a generic message when the helper says nothing", async () => {
		const helperPath = await helper("silent", `process.exit(2);`);
		const result = await reduceBlobsInBatches({ ...(await baseOpts("silent-scratch")), helperPath });
		expect(result).toEqual({ ok: false, unsupported: false, message: "merge helper exited with code 2" });
	});

	it("reports a helper that cannot be started", async () => {
		const result = await reduceBlobsInBatches({ ...(await baseOpts("nocwd-scratch")), cwd: path.join(WORK, "does-not-exist") });
		expect(result.ok).toBe(false);
		expect(result.unsupported).toBe(false);
		expect(result.message).toMatch(/ENOENT/);
	});
});

describe("resolveMergeBatchSize", () => {
	it("defaults to DEFAULT_MERGE_BATCH_SIZE", () => {
		expect(resolveMergeBatchSize(undefined, {})).toBe(DEFAULT_MERGE_BATCH_SIZE);
		expect(DEFAULT_MERGE_BATCH_SIZE).toBe(50);
	});
	it("reads VITEST_MERGE_BATCH_SIZE, and the option wins over it", () => {
		expect(resolveMergeBatchSize(undefined, { VITEST_MERGE_BATCH_SIZE: "8" })).toBe(8);
		expect(resolveMergeBatchSize(12, { VITEST_MERGE_BATCH_SIZE: "8" })).toBe(12);
		expect(resolveMergeBatchSize(undefined, { VITEST_MERGE_BATCH_SIZE: "0" })).toBe(0);
	});
	it("treats 0 as off, raises 1 to 2, ignores junk", () => {
		expect(resolveMergeBatchSize(0, {})).toBe(0);
		expect(resolveMergeBatchSize(1, {})).toBe(2);
		expect(resolveMergeBatchSize(7.9, {})).toBe(7);
		expect(resolveMergeBatchSize("abc", {})).toBe(DEFAULT_MERGE_BATCH_SIZE);
		expect(resolveMergeBatchSize(-3, { VITEST_MERGE_BATCH_SIZE: "9" })).toBe(9);
		expect(resolveMergeBatchSize(null, { VITEST_MERGE_BATCH_SIZE: "" })).toBe(DEFAULT_MERGE_BATCH_SIZE);
	});
});

describe("version and package helpers", () => {
	it("supports vitest 5.x only", () => {
		expect(isSupportedVitestVersion("5.0.5")).toBe(true);
		expect(isSupportedVitestVersion("4.1.0")).toBe(false);
		expect(isSupportedVitestVersion("6.0.0")).toBe(false);
	});
	it("finds the installed vitest above its bin, and null when there is none", async () => {
		expect(vitestPkg.version).toMatch(/^\d+\.\d+\.\d+/);
		expect(await exists(path.join(vitestPkg.dir, "package.json"))).toBe(true);
		const lonely = path.join(WORK, "lonely", "bin.mjs");
		await fs.mkdir(path.dirname(lonely), { recursive: true });
		await fs.writeFile(lonely, "");
		expect(findVitestPackage(lonely)).toBeNull();
	});
	it("chunks into groups of at most the batch size", () => {
		expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
	});
});

describe("assertBlobShape", () => {
	const v = "5.0.5";
	const good = () => [v, [], [], undefined, 1, { p: { environments: { ssr: { idTable: [], modules: [] } }, external: [] } }];
	it("accepts a well-formed blob", () => {
		expect(() => assertBlobShape(good(), v, "x.blob")).not.toThrow();
	});
	it.each([
		["not an array", () => "nope", /6-field/],
		["wrong length", () => good().slice(0, 5), /6-field/],
		["other version", () => ["4.0.0", ...good().slice(1)], /written by vitest 4.0.0/],
		["files", () => Object.assign(good(), { 1: {} }), /files/],
		["errors", () => Object.assign(good(), { 2: null }), /errors/],
		["coverage", () => Object.assign(good(), { 3: "str" }), /coverage/],
		["executionTime", () => Object.assign(good(), { 4: "1" }), /executionTime/],
		["environmentModules", () => Object.assign(good(), { 5: null }), /environmentModules is not/],
		["project environments", () => Object.assign(good(), { 5: { p: { external: [] } } }), /no environments/],
		["project external", () => Object.assign(good(), { 5: { p: { environments: {} } } }), /external/],
		["graph", () => Object.assign(good(), { 5: { p: { environments: { ssr: { idTable: [] } }, external: [] } } }), /idTable\/modules/]
	])("rejects a bad %s", (_label, make, message) => {
		expect(() => assertBlobShape(make(), v, "x.blob")).toThrow(UnsupportedBlobError);
		expect(() => assertBlobShape(make(), v, "x.blob")).toThrow(message);
	});
});

describe("EnvironmentModulesAccumulator", () => {
	it("keeps each module once with the union of its imports, and dedupes externals", () => {
		const acc = new EnvironmentModulesAccumulator();
		acc.add({
			p: {
				environments: {
					ssr: {
						idTable: ["/a", "/a.f", "/a.u", "/b", "/b.f", "/b.u"],
						modules: [
							[0, 1, 2, [3]],
							[3, 4, 5, []]
						]
					}
				},
				external: [["dep", "/node_modules/dep/index.js"]]
			}
		});
		acc.add({
			p: {
				environments: {
					ssr: {
						idTable: ["/c", "/c.f", "/c.u", "/a", "/a.f", "/a.u"],
						modules: [
							[3, 4, 5, [0]],
							[0, 1, 2, []]
						]
					},
					client: { idTable: ["/z"], modules: [[0, 0, 0, []]] }
				},
				external: [["dep", "/node_modules/dep/index.js"]]
			},
			q: { environments: {}, external: [] }
		});

		const json = acc.toJSON();
		const decode = (g) =>
			Object.fromEntries(
				g.modules.map(([id, file, url, imp]) => [
					g.idTable[id],
					{ file: g.idTable[file], url: g.idTable[url], imports: imp.map((i) => g.idTable[i]).sort() }
				])
			);
		expect(decode(json.p.environments.ssr)).toEqual({
			"/a": { file: "/a.f", url: "/a.u", imports: ["/b", "/c"] },
			"/b": { file: "/b.f", url: "/b.u", imports: [] },
			"/c": { file: "/c.f", url: "/c.u", imports: [] }
		});
		expect(decode(json.p.environments.client)).toEqual({ "/z": { file: "/z", url: "/z", imports: [] } });
		expect(json.p.external).toEqual([["dep", "/node_modules/dep/index.js"]]);
		expect(json.q).toEqual({ environments: {}, external: [] });
	});
});
