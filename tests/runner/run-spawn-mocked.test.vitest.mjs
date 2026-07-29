/**
 * @fileoverview Tests for runner.mjs error-handling .catch() paths.
 *
 * Uses vi.mock to make runSingleFile() reject so that the .catch() handlers
 * in run()'s solo and parallel phases are exercised in both standard and
 * coverage modes.
 *
 * Covered lines:
 *   runner.mjs:340-342  — solo phase catch (standard mode)
 *   runner.mjs:358      — parallel phase catch (standard mode)
 *   runner.mjs:226      — solo phase catch (coverage mode)
 *   runner.mjs:237      — parallel phase catch (coverage mode)
 *   runner.mjs:247-249  — "no blobs generated" guard (coverage mode)
 */
import { vi, describe, it, expect, afterEach } from "vitest";
import fs from "node:fs/promises";

// vi.mock is hoisted by vitest — this mock applies to runner.mjs's own import
// of spawn.mjs as well as this test file's direct import.
vi.mock("../../src/core/spawn.mjs", async (importOriginal) => {
	const orig = await importOriginal();
	return {
		...orig,
		runSingleFile: vi.fn(),
		runMergeReports: vi.fn().mockResolvedValue({ exitCode: 0, output: "" })
	};
});

import path from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "../../src/runner.mjs";
import { runSingleFile, runMergeReports } from "../../src/core/spawn.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "../..");
const FIXTURES = path.join(PKG_ROOT, "tests", "fixtures");
const FIXTURE_CONFIG = path.join(FIXTURES, "vitest.config.mjs");

// Base options shared across tests
const BASE = {
	cwd: PKG_ROOT,
	testDir: path.join(FIXTURES, "passing"),
	vitestConfig: FIXTURE_CONFIG
};

/**
 * runSingleFile mock that writes a `.blob` file to the per-file `--outputFile`
 * path the runner passes in, then returns a passing result.
 * @param {string} filePath
 * @param {{ vitestArgs: string[] }} options
 * @returns {Promise<object>}
 */
const writeBlobMock = async (filePath, options) => {
	const outputFile = options.vitestArgs.find((arg) => arg.startsWith("--outputFile=")).slice("--outputFile=".length);
	await fs.writeFile(outputFile, "blob");
	return {
		file: String(filePath),
		code: 0,
		duration: 100,
		testFilesPass: 1,
		testFilesFail: 0,
		testsPass: 1,
		testsFail: 0,
		testsSkip: 0,
		heapMb: null,
		errors: [],
		rawOutput: ""
	};
};

// ─── STANDARD (NON-COVERAGE) MODE ────────────────────────────────────────────
describe("run() — spawn catch handlers: standard mode", () => {
	afterEach(() => {
		vi.resetAllMocks();
	});

	it("catches solo + parallel phase rejections and returns 0 with empty results (runner.mjs:340-342, 358)", async () => {
		// Both a.test (solo) and b.test (parallel) will fail via the .catch() handlers.
		// With no successes, the final report returns 0 ("All 0 test files passed").
		vi.mocked(runSingleFile).mockRejectedValue(new Error("simulated spawn rejection"));

		const code = await run({
			...BASE,
			// "a.test" → soloFiles, "b.test" → parallelFiles
			earlyRunPatterns: ["a.test"]
		});

		expect(code).toBe(0);
		expect(runSingleFile).toHaveBeenCalled();
	}, 60_000);

	it("catches solo + parallel rejections without logging when emitTextOutput is false", async () => {
		vi.mocked(runSingleFile).mockRejectedValue(new Error("simulated spawn rejection"));

		const code = await run({
			...BASE,
			earlyRunPatterns: ["a.test"],
			emitTextOutput: false
		});

		expect(code).toBe(0);
		expect(runSingleFile).toHaveBeenCalled();
	}, 60_000);

	it("covers solo/parallel catch branches in json mode without console error logging", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		vi.mocked(runSingleFile).mockRejectedValue(new Error("simulated spawn rejection"));

		const report = await run({
			...BASE,
			earlyRunPatterns: ["a.test"],
			json: true
		});

		expect(report).toMatchObject({ mode: "standard", exitCode: 0 });
		expect(errorSpy).not.toHaveBeenCalled();
		errorSpy.mockRestore();
	}, 60_000);
});

// ─── COVERAGE MODE ───────────────────────────────────────────────────────────
describe("run() — spawn catch handlers: coverage mode", () => {
	afterEach(() => {
		vi.resetAllMocks();
	});

	it("catches solo + parallel coverage rejections; no blobs → returns 1 (runner.mjs:226, 237, 247-249)", async () => {
		// runCoverageFile() awaits runSingleFile(); when that rejects, runCoverageFile
		// throws and is caught by the .catch() at lines 226 / 237.
		// Since no blobs land in blobsDir the "no blobs" guard fires → return 1.
		vi.mocked(runSingleFile).mockRejectedValue(new Error("simulated coverage spawn rejection"));

		const code = await run({
			...BASE,
			coverageQuiet: true,
			// "a.test" → soloFiles (line 226), "b.test" → parallelFiles (line 237)
			earlyRunPatterns: ["a.test"],
			vitestArgs: ["--coverage", "--coverage.provider=v8"]
		});

		expect(code).toBe(1); // no blobs generated → coverage mode returns 1
		expect(runSingleFile).toHaveBeenCalled();
	}, 60_000);
});

describe("run() — output suppression and json mode", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.resetAllMocks();
	});

	it("passes streamOutput=false to runSingleFile when suppressFileOutput is true", async () => {
		vi.mocked(runSingleFile).mockResolvedValue({
			file: "tests/fixtures/passing/a.test.vitest.mjs",
			code: 0,
			duration: 100,
			testFilesPass: 1,
			testFilesFail: 0,
			testsPass: 1,
			testsFail: 0,
			testsSkip: 0,
			heapMb: null,
			errors: [],
			rawOutput: ""
		});

		const code = await run({
			...BASE,
			testPatterns: ["a.test.vitest.mjs"],
			suppressFileOutput: true
		});

		expect(code).toBe(0);
		expect(runSingleFile).toHaveBeenCalled();
		expect(vi.mocked(runSingleFile).mock.calls[0][1]?.streamOutput).toBe(false);
	});

	it("returns structured JSON report when json is true", async () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		vi.mocked(runSingleFile).mockResolvedValue({
			file: "tests/fixtures/passing/a.test.vitest.mjs",
			code: 0,
			duration: 100,
			testFilesPass: 1,
			testFilesFail: 0,
			testsPass: 1,
			testsFail: 0,
			testsSkip: 0,
			heapMb: null,
			errors: [],
			rawOutput: ""
		});

		const report = await run({
			...BASE,
			testPatterns: ["a.test.vitest.mjs"],
			json: true
		});

		expect(typeof report).toBe("object");
		expect(report).toMatchObject({ mode: "standard", exitCode: 0 });
		expect(report.results.all).toHaveLength(1);
		expect(logSpy).not.toHaveBeenCalled();
	});

	it("includes top summary arrays in JSON output by default", async () => {
		vi.mocked(runSingleFile).mockResolvedValue({
			file: "tests/fixtures/passing/a.test.vitest.mjs",
			code: 0,
			duration: 100,
			testFilesPass: 1,
			testFilesFail: 0,
			testsPass: 1,
			testsFail: 0,
			testsSkip: 0,
			heapMb: null,
			errors: [],
			rawOutput: ""
		});

		const report = await run({
			...BASE,
			testPatterns: ["a.test.vitest.mjs"],
			json: true
		});

		expect(report).toHaveProperty("topMemoryUsers");
		expect(report).toHaveProperty("topDuration");
		expect(report.topDuration).toHaveLength(1);
	});

	it("omits top summary arrays in JSON output when topSummary is false", async () => {
		vi.mocked(runSingleFile).mockResolvedValue({
			file: "tests/fixtures/passing/a.test.vitest.mjs",
			code: 0,
			duration: 100,
			testFilesPass: 1,
			testFilesFail: 0,
			testsPass: 1,
			testsFail: 0,
			testsSkip: 0,
			heapMb: null,
			errors: [],
			rawOutput: ""
		});

		const report = await run({
			...BASE,
			testPatterns: ["a.test.vitest.mjs"],
			json: true,
			topSummary: false
		});

		expect(report).not.toHaveProperty("topMemoryUsers");
		expect(report).not.toHaveProperty("topDuration");
	});

	it("returns JSON no-tests payload in standard mode including topSummary option", async () => {
		const report = await run({
			...BASE,
			testPatterns: ["does-not-exist-never"],
			json: true,
			topSummary: false
		});

		expect(report).toMatchObject({
			exitCode: 1,
			mode: "standard",
			options: { topSummary: false }
		});
	});

	it("returns JSON no-tests payload in coverage mode including topSummary option", async () => {
		const report = await run({
			...BASE,
			vitestArgs: ["--coverage", "--coverage.provider=v8"],
			testFilePattern: /\.never-matches-this$/,
			json: true,
			topSummary: false
		});

		expect(report).toMatchObject({
			exitCode: 1,
			mode: "coverage",
			options: { topSummary: false }
		});
	});

	it("returns JSON no-blob payload in coverage mode including topSummary option", async () => {
		vi.mocked(runSingleFile).mockRejectedValue(new Error("simulated coverage spawn rejection"));

		const report = await run({
			...BASE,
			coverageQuiet: true,
			earlyRunPatterns: ["a.test"],
			vitestArgs: ["--coverage", "--coverage.provider=v8"],
			json: true,
			topSummary: false
		});

		expect(report).toMatchObject({
			exitCode: 1,
			mode: "coverage",
			merge: { blobFiles: 0, exitCode: 1 },
			options: { topSummary: false }
		});
	});

	it("reports non-empty totals/results in no-blob coverage JSON when runs complete without blobs", async () => {
		vi.mocked(runSingleFile).mockResolvedValue({
			file: "tests/fixtures/passing/a.test.vitest.mjs",
			code: 1,
			duration: 100,
			testFilesPass: 0,
			testFilesFail: 1,
			testsPass: 0,
			testsFail: 1,
			testsSkip: 0,
			heapMb: null,
			errors: [],
			rawOutput: ""
		});

		const report = await run({
			...BASE,
			coverageQuiet: true,
			vitestArgs: ["--coverage", "--coverage.provider=v8"],
			json: true
		});

		expect(report).toMatchObject({
			exitCode: 1,
			mode: "coverage",
			totals: {
				testFiles: 2,
				failedFiles: 2,
				passedFiles: 0
			},
			results: {
				all: expect.any(Array),
				failed: expect.any(Array)
			}
		});
		expect(report.results.all).toHaveLength(2);
		expect(report.results.failed).toHaveLength(2);
	});

	it("redirects per-file blobs into a custom blobsDir and merges from there", async () => {
		const blobsDir = path.join(PKG_ROOT, "tmp", "blobs-custom");
		await fs.rm(blobsDir, { recursive: true, force: true });
		vi.mocked(runSingleFile).mockImplementation(writeBlobMock);
		vi.mocked(runMergeReports).mockResolvedValue({ exitCode: 0, output: "merged" });

		try {
			const code = await run({
				...BASE,
				blobsDir,
				suppressFileOutput: true,
				vitestArgs: ["--coverage", "--coverage.provider=v8"]
			});

			expect(code).toBe(0);

			// Every per-file --outputFile lands inside the custom blobsDir.
			const outputFiles = vi
				.mocked(runSingleFile)
				.mock.calls.map(([, options]) => options.vitestArgs.find((a) => a.startsWith("--outputFile=")).slice("--outputFile=".length));
			expect(outputFiles.length).toBeGreaterThan(0);
			for (const f of outputFiles) expect(f.startsWith(blobsDir)).toBe(true);

			// mergeReports defaults to true → merge runs against the custom dir.
			expect(runMergeReports).toHaveBeenCalledWith(blobsDir, expect.any(Object));
		} finally {
			await fs.rm(blobsDir, { recursive: true, force: true });
		}
	}, 60_000);

	it("returns coverage JSON with top summaries when multiple mocked files produce blobs", async () => {
		vi.mocked(runSingleFile).mockImplementation(async (filePath, options) => {
			const outputFileArg = options.vitestArgs.find((arg) => arg.startsWith("--outputFile="));
			const outputFile = outputFileArg.slice("--outputFile=".length);
			await fs.writeFile(outputFile, "blob");
			return {
				file: String(filePath),
				code: 0,
				duration: String(filePath).includes("a.test") ? 200 : 100,
				testFilesPass: 1,
				testFilesFail: 0,
				testsPass: 1,
				testsFail: 0,
				testsSkip: 0,
				heapMb: String(filePath).includes("a.test") ? 300 : 100,
				errors: [],
				rawOutput: ""
			};
		});
		vi.mocked(runMergeReports).mockResolvedValue({ exitCode: 0, output: "merged" });

		const report = await run({
			...BASE,
			json: true,
			vitestArgs: ["--coverage", "--coverage.provider=v8"]
		});

		expect(report).toMatchObject({ mode: "coverage", exitCode: 0 });
		expect(report.topMemoryUsers).toHaveLength(2);
		expect(report.topDuration).toHaveLength(2);
		expect(report.topMemoryUsers[0].heapMb).toBeGreaterThanOrEqual(report.topMemoryUsers[1].heapMb);
		expect(report.topDuration[0].duration).toBeGreaterThanOrEqual(report.topDuration[1].duration);
	});
});

describe("run() — mergeReports:false (coverage blobs left for external merge)", () => {
	afterEach(() => {
		vi.resetAllMocks();
	});

	it("produces blobs, skips the internal merge, and leaves blobsDir populated", async () => {
		const blobsDir = path.join(PKG_ROOT, "tmp", "blobs-no-merge");
		await fs.rm(blobsDir, { recursive: true, force: true });
		vi.mocked(runSingleFile).mockImplementation(writeBlobMock);

		try {
			const code = await run({
				...BASE,
				blobsDir,
				mergeReports: false,
				suppressFileOutput: true,
				vitestArgs: ["--coverage", "--coverage.provider=v8"]
			});

			expect(code).toBe(0);
			expect(runMergeReports).not.toHaveBeenCalled();

			// a.test + b.test → two blobs that survive for the external merge.
			const blobs = (await fs.readdir(blobsDir)).filter((f) => f.endsWith(".blob"));
			expect(blobs).toHaveLength(2);
		} finally {
			await fs.rm(blobsDir, { recursive: true, force: true });
		}
	}, 60_000);

	it("still clears blobsDir at the start of the run, keeping only fresh blobs", async () => {
		const blobsDir = path.join(PKG_ROOT, "tmp", "blobs-start-clean");
		await fs.rm(blobsDir, { recursive: true, force: true });
		await fs.mkdir(blobsDir, { recursive: true });
		await fs.writeFile(path.join(blobsDir, "stale.blob"), "old");
		await fs.writeFile(path.join(blobsDir, "stale.txt"), "old");
		vi.mocked(runSingleFile).mockImplementation(writeBlobMock);

		try {
			const code = await run({
				...BASE,
				blobsDir,
				mergeReports: false,
				suppressFileOutput: true,
				vitestArgs: ["--coverage", "--coverage.provider=v8"]
			});

			expect(code).toBe(0);
			const entries = await fs.readdir(blobsDir);
			expect(entries).not.toContain("stale.blob");
			expect(entries).not.toContain("stale.txt");
			expect(entries.filter((f) => f.endsWith(".blob"))).toHaveLength(2);
		} finally {
			await fs.rm(blobsDir, { recursive: true, force: true });
		}
	}, 60_000);

	it("returns coverage JSON with no merge result or coverageSummary", async () => {
		const blobsDir = path.join(PKG_ROOT, "tmp", "blobs-no-merge-json");
		await fs.rm(blobsDir, { recursive: true, force: true });
		vi.mocked(runSingleFile).mockImplementation(writeBlobMock);

		try {
			const report = await run({
				...BASE,
				blobsDir,
				mergeReports: false,
				json: true,
				vitestArgs: ["--coverage", "--coverage.provider=v8"]
			});

			expect(report).toMatchObject({
				mode: "coverage",
				exitCode: 0,
				merge: { blobFiles: 2, exitCode: 0, output: "" },
				coverageSummary: null
			});
			expect(runMergeReports).not.toHaveBeenCalled();

			const blobs = (await fs.readdir(blobsDir)).filter((f) => f.endsWith(".blob"));
			expect(blobs).toHaveLength(2);
		} finally {
			await fs.rm(blobsDir, { recursive: true, force: true });
		}
	}, 60_000);

	it("reflects test failures in the exit code even with no merge result", async () => {
		const blobsDir = path.join(PKG_ROOT, "tmp", "blobs-no-merge-fail");
		await fs.rm(blobsDir, { recursive: true, force: true });
		vi.mocked(runSingleFile).mockImplementation(async (filePath, options) => {
			const result = await writeBlobMock(filePath, options);
			return { ...result, code: 1, testFilesPass: 0, testFilesFail: 1, testsPass: 0, testsFail: 1 };
		});

		try {
			const code = await run({
				...BASE,
				blobsDir,
				mergeReports: false,
				suppressFileOutput: true,
				vitestArgs: ["--coverage", "--coverage.provider=v8"]
			});

			expect(code).toBe(1);
			expect(runMergeReports).not.toHaveBeenCalled();
		} finally {
			await fs.rm(blobsDir, { recursive: true, force: true });
		}
	}, 60_000);
});
