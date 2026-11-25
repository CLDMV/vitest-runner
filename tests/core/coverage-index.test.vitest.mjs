/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/core/coverage-index.test.vitest.mjs
 *	@Date: 2026-11-25T02:45:55-08:00 (1795603555)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-25T12:16:05-08:00 (1795637765)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * @fileoverview Tests for the coverage index (src/core/coverage-index.mjs) and its
 * wiring into run().
 *
 * The run() tests use the merge-batches fixture project (tests/fixtures/merge-batches/):
 * small source files in src/ and one test file per case in cases/, so which test
 * reaches which function is known exactly.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run, runMergeReports, resolveBin, stripAnsi, writeCoverageIndexFromBlobs as exportedFromBlobs } from "../../src/index.mjs";
import {
	COVERAGE_INDEX_FILENAME,
	COVERAGE_INDEX_VERSION,
	CoverageIndexBuilder,
	blobTestFiles,
	fileCoverages,
	functionKeys,
	resolveCommit,
	toProjectPath,
	writeCoverageIndex,
	writeCoverageIndexFromBlobs
} from "../../src/core/coverage-index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "../..");
const FIXTURE = path.join(PKG_ROOT, "tests", "fixtures", "merge-batches");
const CONFIG = path.join(FIXTURE, "vitest.config.mjs");
const WORK = path.join(PKG_ROOT, "tmp", `coverage-index-tests-${process.pid}`);

/** A JSON stand-in for flatted: blobs in these unit tests are plain JSON arrays. */
const jsonFlatted = { parse: (text) => JSON.parse(text) };

/** @param {string} p */
const readJson = async (p) => JSON.parse(await fs.readFile(p, "utf-8"));

/**
 * Istanbul file coverage with the given functions.
 * @param {string} file
 * @param {Array<[string, number, number]>} fns - `[name, line, count]`
 */
const fileCov = (file, fns) => ({
	path: file,
	fnMap: Object.fromEntries(fns.map(([name, line], i) => [String(i), { name, decl: { start: { line } }, loc: { start: { line } } }])),
	f: Object.fromEntries(fns.map(([, , count], i) => [String(i), count]))
});

beforeAll(async () => {
	await fs.rm(WORK, { recursive: true, force: true });
	await fs.mkdir(WORK, { recursive: true });
});

afterAll(async () => {
	await fs.rm(WORK, { recursive: true, force: true });
});

describe("toProjectPath", () => {
	it("makes absolute and relative paths project-relative with forward slashes", () => {
		expect(toProjectPath("/repo", "/repo/src/a.mjs")).toBe("src/a.mjs");
		expect(toProjectPath("/repo", "tests/b.test.mjs")).toBe("tests/b.test.mjs");
		expect(toProjectPath("/repo", "/elsewhere/c.mjs")).toBe("../elsewhere/c.mjs");
	});
});

describe("fileCoverages", () => {
	it("reads vitest's serialized CoverageMap ({ data: { path: { data: FileCoverage } } })", () => {
		const cov = { data: { "/r/a.mjs": { data: fileCov("/r/a.mjs", [["a", 1, 1]]) } } };
		expect(fileCoverages(cov)).toEqual([{ path: "/r/a.mjs", fnMap: cov.data["/r/a.mjs"].data.fnMap, f: { 0: 1 } }]);
	});

	it("reads a plain JSON map and takes the key when a record has no path", () => {
		const fc = fileCov("/r/a.mjs", [["a", 1, 0]]);
		delete fc.path;
		delete fc.f;
		expect(fileCoverages({ "/r/a.mjs": fc })).toEqual([{ path: "/r/a.mjs", fnMap: fc.fnMap, f: {} }]);
	});

	it("returns nothing for missing coverage and skips records without a fnMap", () => {
		expect(fileCoverages(undefined)).toEqual([]);
		expect(fileCoverages(null)).toEqual([]);
		expect(fileCoverages("x")).toEqual([]);
		expect(fileCoverages({ "/r/a.mjs": null, "/r/b.mjs": { path: "/r/b.mjs" } })).toEqual([]);
	});
});

describe("functionKeys", () => {
	it("keys by name, and by name@line for every occurrence of a repeated name", () => {
		const fnMap = {
			0: { name: "get", decl: { start: { line: 3 } } },
			1: { name: "set", decl: { start: { line: 5 } } },
			2: { name: "get", loc: { start: { line: 9 } } },
			3: { name: "get" }
		};
		expect(functionKeys(fnMap)).toEqual([
			["0", "get@3"],
			["1", "set"],
			["2", "get@9"],
			["3", "get@3"]
		]);
	});
});

describe("CoverageIndexBuilder", () => {
	it("lists the tests that reached each function, sorted, with [] for unreached functions", () => {
		const b = new CoverageIndexBuilder("/r");
		b.add("/r/tests/z.test.mjs", {
			"/r/src/a.mjs": fileCov("/r/src/a.mjs", [
				["one", 1, 2],
				["two", 5, 0]
			])
		});
		b.add("/r/tests/b.test.mjs", {
			"/r/src/a.mjs": fileCov("/r/src/a.mjs", [
				["one", 1, 1],
				["two", 5, 0]
			])
		});
		b.add("/r/tests/b.test.mjs", { "/r/lib/c.mjs": fileCov("/r/lib/c.mjs", [["c", 1, 3]]) });
		const index = b.toJSON("abc");
		expect(index).toEqual({
			version: COVERAGE_INDEX_VERSION,
			commit: "abc",
			files: {
				"lib/c.mjs": { c: ["tests/b.test.mjs"] },
				"src/a.mjs": { one: ["tests/b.test.mjs", "tests/z.test.mjs"], two: [] }
			}
		});
		expect(Object.keys(index.files)).toEqual(["lib/c.mjs", "src/a.mjs"]);
	});
});

describe("blobTestFiles", () => {
	it("reads each file task's filepath, falling back to its name, and skips the rest", () => {
		expect(blobTestFiles([{ filepath: "/r/tests/a.test.mjs", name: "tests/a.test.mjs" }, { name: "tests/b.test.mjs" }, {}, null])).toEqual([
			"/r/tests/a.test.mjs",
			"tests/b.test.mjs"
		]);
		expect(blobTestFiles(undefined)).toEqual([]);
	});
});

describe("CoverageIndexBuilder — several test files in one blob", () => {
	it("credits every test file of the blob", () => {
		const builder = new CoverageIndexBuilder("/r");
		builder.add(["/r/tests/b.test.mjs", "/r/tests/a.test.mjs"], {
			"/r/src/x.mjs": fileCov("/r/src/x.mjs", [
				["hit", 1, 2],
				["miss", 2, 0]
			])
		});
		expect(builder.toJSON(null).files).toEqual({ "src/x.mjs": { hit: ["tests/a.test.mjs", "tests/b.test.mjs"], miss: [] } });
	});
});

describe("resolveCommit", () => {
	it("returns HEAD of a git checkout", async () => {
		const dir = path.join(WORK, "git-repo");
		await fs.mkdir(dir, { recursive: true });
		const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf-8" }).trim();
		git("init", "-q");
		git("-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", "commit", "-q", "--allow-empty", "-m", "x");
		expect(await resolveCommit(dir, {})).toBe(git("rev-parse", "HEAD"));
	});

	it("falls back to GITHUB_SHA, then null, outside a git checkout", async () => {
		// The filesystem root is never inside a git work tree.
		const root = path.parse(PKG_ROOT).root;
		expect(await resolveCommit(root, { GITHUB_SHA: " deadbeef \n" })).toBe("deadbeef");
		expect(await resolveCommit(root, {})).toBeNull();
	});
});

describe("writeCoverageIndex", () => {
	it("reads each blob's coverage, skips missing blobs, and writes the index into a new directory", async () => {
		const dir = path.join(WORK, "write");
		await fs.mkdir(dir, { recursive: true });
		const blobA = path.join(dir, "a.blob");
		await fs.writeFile(blobA, JSON.stringify(["5", [], [], { "/r/src/a.mjs": fileCov("/r/src/a.mjs", [["one", 1, 1]]) }, 0, {}]));
		const outputDir = path.join(dir, "out", "coverage");
		const result = await writeCoverageIndex({
			entries: [
				{ blob: blobA, testFile: "/r/tests/a.test.mjs" },
				{ blob: path.join(dir, "missing.blob"), testFile: "/r/tests/missing.test.mjs" }
			],
			cwd: "/r",
			outputDir,
			flatted: jsonFlatted,
			commit: null
		});
		expect(result).toEqual({ path: path.join(outputDir, COVERAGE_INDEX_FILENAME), files: 1, testFiles: 1 });
		expect(await readJson(result.path)).toEqual({ version: 1, commit: null, files: { "src/a.mjs": { one: ["tests/a.test.mjs"] } } });
	});

	it("resolves the commit itself when none is given", async () => {
		const dir = path.join(WORK, "write-commit");
		const result = await writeCoverageIndex({ entries: [], cwd: PKG_ROOT, outputDir: dir, flatted: jsonFlatted });
		expect((await readJson(result.path)).commit).toBe(await resolveCommit(PKG_ROOT));
	});

	it("reads the test files from the blob when an entry doesn't name one", async () => {
		const dir = path.join(WORK, "write-from-blob");
		await fs.mkdir(dir, { recursive: true });
		const blob = path.join(dir, "a.blob");
		const files = [{ filepath: "/r/tests/a.test.mjs" }, { filepath: "/r/tests/b.test.mjs" }];
		await fs.writeFile(blob, JSON.stringify(["5", files, [], { "/r/src/a.mjs": fileCov("/r/src/a.mjs", [["one", 1, 1]]) }, 0, {}]));
		const result = await writeCoverageIndex({
			entries: [{ blob }, { blob }],
			cwd: "/r",
			outputDir: dir,
			flatted: jsonFlatted,
			commit: null
		});
		expect(result.testFiles).toBe(2);
		expect((await readJson(result.path)).files).toEqual({ "src/a.mjs": { one: ["tests/a.test.mjs", "tests/b.test.mjs"] } });
	});

	it("rejects a blob that isn't a vitest blob array", async () => {
		const blob = path.join(WORK, "bad.blob");
		await fs.writeFile(blob, JSON.stringify({ not: "a blob" }));
		await expect(
			writeCoverageIndex({ entries: [{ blob, testFile: "t.mjs" }], cwd: WORK, outputDir: WORK, flatted: jsonFlatted, commit: null })
		).rejects.toThrow("bad.blob is not a vitest blob");
	});
});

describe("run() — coverage index", () => {
	it("writes coverage-index.json next to the summary, mapping functions to the tests that reached them", async () => {
		const coverageDir = path.join(WORK, "run", "coverage");
		const report = await run({
			cwd: FIXTURE,
			testDir: path.join(FIXTURE, "cases"),
			testPatterns: ["add.test", "initials.test", "shout.test"],
			vitestConfig: CONFIG,
			vitestArgs: ["--coverage", `--coverage.reportsDirectory=${coverageDir}`],
			blobsDir: path.join(WORK, "run", "blobs"),
			scratchDir: path.join(WORK, "run", "scratch"),
			json: true,
			workers: 1,
			fsModuleCachePath: false
		});
		expect(report.exitCode).toBe(0);
		const indexPath = path.join(coverageDir, COVERAGE_INDEX_FILENAME);
		expect(report.coverageIndex).toEqual({ path: indexPath, files: 2, testFiles: 3 });

		const index = await readJson(indexPath);
		expect(index.version).toBe(1);
		expect(index.commit).toBe(await resolveCommit(FIXTURE));
		expect(index.files).toEqual({
			"src/calc.mjs": {
				add: ["cases/add.test.vitest.mjs", "cases/initials.test.vitest.mjs"],
				sign: [],
				clamp: []
			},
			"src/text.mjs": {
				shout: ["cases/shout.test.vitest.mjs"],
				initials: ["cases/initials.test.vitest.mjs"],
				"(anonymous_2)": ["cases/initials.test.vitest.mjs"],
				pad: ["cases/initials.test.vitest.mjs"]
			}
		});
		// The blobs are still removed after the index is written.
		await expect(fs.access(path.join(WORK, "run", "blobs"))).rejects.toThrow();
	}, 180_000);

	it("prints where the index was written in text mode", async () => {
		const coverageDir = path.join(WORK, "run-text", "coverage");
		const lines = [];
		const logSpy = vi.spyOn(console, "log").mockImplementation((...args) => lines.push(args.join(" ")));
		try {
			const code = await run({
				cwd: FIXTURE,
				testDir: path.join(FIXTURE, "cases"),
				testPatterns: ["shout.test"],
				vitestConfig: CONFIG,
				vitestArgs: ["--coverage", `--coverage.reportsDirectory=${coverageDir}`],
				blobsDir: path.join(WORK, "run-text", "blobs"),
				scratchDir: path.join(WORK, "run-text", "scratch"),
				workers: 1,
				fsModuleCachePath: false,
				topSummary: false
			});
			expect(code).toBe(0);
		} finally {
			logSpy.mockRestore();
		}
		const line = stripAnsi(lines.join("\n"));
		expect(line).toContain(
			`Coverage index: ${path.relative(FIXTURE, path.join(coverageDir, COVERAGE_INDEX_FILENAME))} (2 source files, 1 test files)`
		);
	}, 180_000);

	it("writes no index with coverageIndex: false", async () => {
		const coverageDir = path.join(WORK, "run-off", "coverage");
		const report = await run({
			cwd: FIXTURE,
			testDir: path.join(FIXTURE, "cases"),
			testPatterns: ["add.test"],
			vitestConfig: CONFIG,
			vitestArgs: ["--coverage", `--coverage.reportsDirectory=${coverageDir}`],
			blobsDir: path.join(WORK, "run-off", "blobs"),
			scratchDir: path.join(WORK, "run-off", "scratch"),
			json: true,
			workers: 1,
			fsModuleCachePath: false,
			coverageIndex: false
		});
		expect(report.exitCode).toBe(0);
		expect(report.coverageIndex).toBeNull();
		await expect(fs.access(path.join(coverageDir, COVERAGE_INDEX_FILENAME))).rejects.toThrow();
		await expect(fs.access(path.join(coverageDir, "coverage-summary.json"))).resolves.toBeUndefined();
	}, 180_000);
});

describe("writeCoverageIndexFromBlobs — external merge", () => {
	it("writes the same index after mergeReports: false and the caller's own merge", async () => {
		const base = path.join(WORK, "external");
		const blobsDir = path.join(base, "blobs");
		const coverageDir = path.join(base, "coverage");
		const coverageArgs = [`--coverage.reportsDirectory=${coverageDir}`];
		const report = await run({
			cwd: FIXTURE,
			testDir: path.join(FIXTURE, "cases"),
			testPatterns: ["add.test", "initials.test", "shout.test"],
			vitestConfig: CONFIG,
			vitestArgs: ["--coverage", ...coverageArgs],
			blobsDir,
			mergeReports: false,
			scratchDir: path.join(base, "scratch"),
			json: true,
			workers: 1,
			fsModuleCachePath: false
		});
		expect(report.exitCode).toBe(0);
		expect(report.coverageIndex).toBeNull();

		const vitestBin = resolveBin(FIXTURE, "vitest");
		const merged = await runMergeReports(blobsDir, {
			cwd: FIXTURE,
			vitestBin,
			vitestConfig: CONFIG,
			extraCoverageArgs: coverageArgs,
			quietOutput: true
		});
		expect(merged.exitCode).toBe(0);

		expect(exportedFromBlobs).toBe(writeCoverageIndexFromBlobs);
		const result = await writeCoverageIndexFromBlobs({ blobsDir: path.relative(FIXTURE, blobsDir), cwd: FIXTURE, outputDir: coverageDir });
		expect(result).toEqual({ path: path.join(coverageDir, COVERAGE_INDEX_FILENAME), files: 2, testFiles: 3 });
		const index = await readJson(result.path);
		expect(index.commit).toBe(await resolveCommit(FIXTURE));
		expect(index.files["src/calc.mjs"]).toEqual({
			add: ["cases/add.test.vitest.mjs", "cases/initials.test.vitest.mjs"],
			sign: [],
			clamp: []
		});
		expect(index.files["src/text.mjs"].shout).toEqual(["cases/shout.test.vitest.mjs"]);

		// Several directories (e.g. node and browser blob sets); the default output is <cwd>/coverage.
		const other = path.join(base, "other-blobs");
		await fs.mkdir(path.join(other, "nested"), { recursive: true });
		const defaults = await writeCoverageIndexFromBlobs({ blobsDir: [blobsDir, other], cwd: base, vitestBin, commit: null });
		expect(defaults.path).toBe(path.join(base, "coverage", COVERAGE_INDEX_FILENAME));
		expect(defaults.testFiles).toBe(3);
	}, 180_000);

	it("throws when the vitest binary isn't inside a vitest package", async () => {
		const dir = path.join(WORK, "no-vitest");
		await fs.mkdir(path.join(dir, "blobs"), { recursive: true });
		const bin = path.join(dir, "vitest.mjs");
		await fs.writeFile(bin, "");
		await expect(writeCoverageIndexFromBlobs({ blobsDir: "blobs", cwd: dir, vitestBin: bin })).rejects.toThrow(
			"installed vitest package not found"
		);
	});
});
