/**
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/integration/run.test.vitest.mjs
 *	@Date: 2026-02-24T23:27:21-08:00 (1772004441)
 *	@Author: Shinrai <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Shinrai <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-09-27 08:51:32 -07:00 (1790524292)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 */

/**
 * @fileoverview Integration tests for the run() API.
 *
 * These tests spawn real child vitest processes against the fixture test files
 * in tests/fixtures/, exercising the full run() orchestration loop.
 *
 * Each test is slow (~2–5 s) due to vitest startup overhead — testTimeout is
 * set to 30 s in vitest.config.mjs.
 */
import { describe, it, expect, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "../../src/runner.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** The vitest-runner package root — vitest is installed here. */
const CWD = path.resolve(__dirname, "../..");
const FIXTURES = path.join(CWD, "tests", "fixtures");

/**
 * Shared base options to silence child stdout in integration tests.
 * coverageQuiet suppresses per-file inherited stdio, keeping test output clean.
 * We deliberately do NOT pass --coverage so the plain (non-blob) runner is used.
 *
 * vitestConfig points to the fixture-specific config so the root vitest.config.mjs
 * (which excludes tests/fixtures/**) does not block the child vitest processes.
 */
const QUIET_BASE = {
	cwd: CWD,
	coverageQuiet: false,
	vitestConfig: path.join(FIXTURES, "vitest.config.mjs")
};

describe("run() — basic pass/fail", () => {
	it("returns 0 when all discovered test files pass", async () => {
		const code = await run({
			...QUIET_BASE,
			testDir: path.join(FIXTURES, "passing")
		});
		expect(code).toBe(0);
	});

	it("defaults cwd to process.cwd() when omitted", async () => {
		const { cwd: _, ...baseWithoutCwd } = QUIET_BASE;
		const code = await run({
			...baseWithoutCwd,
			testDir: path.join(FIXTURES, "passing")
		});
		expect(code).toBe(0);
	});

	it("returns 1 when any test file fails", async () => {
		const code = await run({
			...QUIET_BASE,
			testDir: path.join(FIXTURES, "failing")
		});
		expect(code).toBe(1);
	});

	it("returns 1 when a mix of passing and failing tests is run", async () => {
		const code = await run({
			...QUIET_BASE,
			testDir: FIXTURES,
			// Only run the two fixture subdirs we care about
			testPatterns: [path.join(FIXTURES, "passing"), path.join(FIXTURES, "failing")]
		});
		expect(code).toBe(1);
	});
});

describe("run() — testListFile", () => {
	it("runs only the files in the JSON list and returns 0 for all-pass", async () => {
		const code = await run({
			...QUIET_BASE,
			cwd: CWD,
			testListFile: "tests/fixtures/test-list.json"
		});
		expect(code).toBe(0);
	});

	it("rejects with a descriptive error for a missing test list file", async () => {
		await expect(run({ ...QUIET_BASE, testListFile: "nonexistent-list.json" })).rejects.toThrow(/Failed to read test list file/);
	});
});

describe("run() — testPatterns", () => {
	it("runs only the matched file by partial path", async () => {
		const code = await run({
			...QUIET_BASE,
			testDir: FIXTURES,
			testPatterns: ["passing/a"]
		});
		expect(code).toBe(0);
	});

	it("returns 1 when pattern resolves exclusively to failing fixtures", async () => {
		const code = await run({
			...QUIET_BASE,
			testDir: FIXTURES,
			testPatterns: ["failing/"]
		});
		expect(code).toBe(1);
	});
});

describe("run() — earlyRunPatterns (solo phase)", () => {
	it("runs solo files first and still returns 0 for all-pass", async () => {
		const code = await run({
			...QUIET_BASE,
			testDir: path.join(FIXTURES, "passing"),
			earlyRunPatterns: ["a.test"]
		});
		expect(code).toBe(0);
	});
});

describe("run() — same-basename files in different directories", () => {
	it("does not let Vitest's substring filter merge a root-level file with a same-basename nested file", async () => {
		const report = await run({
			...QUIET_BASE,
			testDir: path.join(FIXTURES, "basename-collision"),
			json: true,
			workers: 1
		});

		expect(report.exitCode).toBe(0);
		// 2 real files (1 root-level "tests/contract...", 1 nested "packages/a/tests/contract...")
		expect(report.totals.testFilesPass).toBe(2);
		expect(report.totals.testsPass).toBe(3); // 2 root tests + 1 nested test

		const rootResult = report.results.all.find((r) =>
			r.file.replace(/\\/g, "/").endsWith("basename-collision/tests/contract.test.vitest.mjs")
		);
		const nestedResult = report.results.all.find((r) =>
			r.file.replace(/\\/g, "/").endsWith("basename-collision/packages/a/tests/contract.test.vitest.mjs")
		);

		expect(rootResult).toBeDefined();
		expect(nestedResult).toBeDefined();
		// Before the fix, the root file's shorter path is a trailing substring of the
		// nested file's path, so Vitest's own CLI filter ran both under the root
		// invocation and double-counted the nested file's test here too.
		expect(rootResult.testsPass).toBe(2);
		expect(nestedResult.testsPass).toBe(1);
	});
});

describe("run() — testFilePattern", () => {
	it("respects a custom pattern that matches fixtures", async () => {
		const code = await run({
			...QUIET_BASE,
			testDir: path.join(FIXTURES, "passing"),
			testFilePattern: /\.test\.vitest\.mjs$/i
		});
		expect(code).toBe(0);
	});

	it("returns 1 (no tests found) when pattern matches nothing", async () => {
		// Pattern that will never match — runner.mjs returns 1 when no files found
		const code = await run({
			...QUIET_BASE,
			testDir: path.join(FIXTURES, "passing"),
			testFilePattern: /\.never-matches-anything-xyz$/
		});
		expect(code).toBe(1);
	});
});

describe("run() — workers option", () => {
	it("respects workers=1 (serial mode) and still succeeds", async () => {
		const code = await run({
			...QUIET_BASE,
			testDir: path.join(FIXTURES, "passing"),
			workers: 1
		});
		expect(code).toBe(0);
	});
});
describe("run() — coverage mode (--coverage)", () => {
	it("runs per-file blob collection then mergeReports and returns 0", async () => {
		const coverageDir = path.join(CWD, "tmp", "test-coverage-integration");
		const code = await run({
			...QUIET_BASE,
			testDir: path.join(FIXTURES, "passing"),
			vitestArgs: ["--coverage", "--coverage.provider=v8", `--coverage.reportsDirectory=${coverageDir}`]
		});
		expect(code).toBe(0);
	});

	it("adds --coverage automatically when coverageQuiet is true but --coverage is absent (line 132)", async () => {
		// coverageQuiet:true with NO --coverage/--coverage.* in vitestArgs at all
		// → !vitestArgs.some(...) is true → runner unshifts '--coverage' (line 132)
		// Coverage output goes to the default ./coverage dir (ignored by .gitignore)
		const code = await run({
			cwd: CWD,
			testDir: path.join(FIXTURES, "passing"),
			coverageQuiet: true,
			vitestConfig: path.join(FIXTURES, "vitest.config.mjs"),
			vitestArgs: [] // deliberately no --coverage.* args — line 132 inserts --coverage
		});
		expect(code).toBe(0);
	});

	it("returns 1 when no test files are found in coverage mode (lines 150-153)", async () => {
		// hasCoverage=true, but testFilePattern matches nothing → no files → early return 1
		const code = await run({
			cwd: CWD,
			testDir: path.join(FIXTURES, "passing"),
			coverageQuiet: true,
			vitestConfig: path.join(FIXTURES, "vitest.config.mjs"),
			vitestArgs: ["--coverage", "--coverage.provider=v8"],
			testFilePattern: /\.never-matches-xyz$/
		});
		expect(code).toBe(1);
	});

	it("logs FAILED for a failing file in non-quiet coverage mode (line 217)", async () => {
		// coverageQuiet: false + failing fixture → runner logs '❌ FAILED' per file (line 217)
		const coverageDir = path.join(CWD, "tmp", "test-coverage-failing-nonquiet");
		const code = await run({
			cwd: CWD,
			testDir: path.join(FIXTURES, "failing"),
			coverageQuiet: false,
			vitestConfig: path.join(FIXTURES, "vitest.config.mjs"),
			vitestArgs: ["--coverage", "--coverage.provider=v8", `--coverage.reportsDirectory=${coverageDir}`]
		});
		expect(code).toBe(1);
	});

	it("partitions soloFiles/parallelFiles in coverage mode with earlyRunPatterns (lines 160-161)", async () => {
		// earlyRunPatterns in coverage mode → soloFiles+parallelFiles split on lines 160-161
		const coverageDir = path.join(CWD, "tmp", "test-coverage-early-patterns");
		const code = await run({
			cwd: CWD,
			testDir: path.join(FIXTURES, "passing"),
			coverageQuiet: true,
			vitestConfig: path.join(FIXTURES, "vitest.config.mjs"),
			earlyRunPatterns: ["a.test"], // puts a.test in soloFiles, b.test in parallelFiles
			vitestArgs: ["--coverage", "--coverage.provider=v8", `--coverage.reportsDirectory=${coverageDir}`]
		});
		expect(code).toBe(0);
	});

	it("logs heap limit in coverage mode when maxOldSpaceMb is set (line 166)", async () => {
		// maxOldSpaceMb in coverage mode → line 166: console.log('🧠 Heap limit: ...')
		const coverageDir = path.join(CWD, "tmp", "test-coverage-heap-limit");
		const code = await run({
			cwd: CWD,
			testDir: path.join(FIXTURES, "passing"),
			coverageQuiet: false,
			vitestConfig: path.join(FIXTURES, "vitest.config.mjs"),
			maxOldSpaceMb: 4096,
			vitestArgs: ["--coverage", "--coverage.provider=v8", `--coverage.reportsDirectory=${coverageDir}`]
		});
		expect(code).toBe(0);
	});
});

describe("run() — perFileHeapOverrides", () => {
	it("applies per-file heap overrides without changing the exit code", async () => {
		const code = await run({
			...QUIET_BASE,
			testDir: path.join(FIXTURES, "passing"),
			perFileHeapOverrides: [{ pattern: "a.test", heapMb: 512 }],
			maxOldSpaceMb: 1024
		});
		expect(code).toBe(0);
	});

	it("applies per-file overrides when no global maxOldSpaceMb is set (line 90 branch)", async () => {
		// perFileMb is set, globalMaxMb is undefined → line 90: return perFileMb
		const code = await run({
			...QUIET_BASE,
			testDir: path.join(FIXTURES, "passing"),
			perFileHeapOverrides: [{ pattern: "a.test", heapMb: 512 }]
			// maxOldSpaceMb intentionally omitted
		});
		expect(code).toBe(0);
	});
});
describe("run() — _testResultsOverride (final-report render paths)", () => {
	/**
	 * Build a synthetic SingleFileResult for injection via _testResultsOverride.
	 * @param {Partial<{file:string,code:number,heapMb:number|null,testsPass:number,testsFail:number,testsSkip:number,errors:string[]}>} opts
	 * @returns {object}
	 */
	function makeResult({
		file = "tests/fixtures/passing/a.test.vitest.mjs",
		code = 0,
		heapMb = null,
		testsPass = 2,
		testsFail = 0,
		testsSkip = 0,
		errors = []
	} = {}) {
		return {
			file,
			code,
			duration: 1500,
			testFilesPass: code === 0 ? 1 : 0,
			testFilesFail: code !== 0 ? 1 : 0,
			testsPass,
			testsFail,
			testsSkip,
			heapMb,
			errors,
			rawOutput: ""
		};
	}

	it("renders 🧠 TOP MEMORY USERS when any result has heapMb set (runner.mjs:376-382)", async () => {
		// heapMb !== null → withHeap has entries → TOP MEMORY USERS block executes
		const code = await run({
			...QUIET_BASE,
			testDir: path.join(FIXTURES, "passing"),
			_testResultsOverride: [makeResult({ heapMb: 512 })]
		});
		expect(code).toBe(0);
	});

	it("renders max/avg heap in summary when heapMb is set (runner.mjs:473-475)", async () => {
		// Same condition re-checked at the bottom summary; both paths run together
		const code = await run({
			...QUIET_BASE,
			testDir: path.join(FIXTURES, "passing"),
			_testResultsOverride: [makeResult({ heapMb: 256 }), makeResult({ file: "tests/fixtures/passing/b.test.vitest.mjs", heapMb: 128 })]
		});
		expect(code).toBe(0);
	});

	it("omits test-count suffix in passed-file row when testsPass === 0 (runner.mjs:412 false)", async () => {
		// r.testsPass === 0 → `r.testsPass > 0 ?` is FALSE → testInfo = "" (no count suffix)
		const code = await run({
			...QUIET_BASE,
			testDir: path.join(FIXTURES, "passing"),
			_testResultsOverride: [makeResult({ testsPass: 0 })]
		});
		expect(code).toBe(0);
	});

	it("omits testsFail/testsPass counts and renders empty countStr for failed file (runner.mjs:427/428/432 false branches)", async () => {
		// testsFail=0 → line 427 FALSE (no "N failed" entry)
		// testsPass=0 → line 428 FALSE (no "N passed" entry)
		// testsSkip=0 → line 429 FALSE (no "N skipped" entry – already covered)
		// testCounts=[] → line 432 FALSE → countStr = ""
		const code = await run({
			...QUIET_BASE,
			testDir: path.join(FIXTURES, "passing"),
			_testResultsOverride: [makeResult({ code: 1, testsFail: 0, testsPass: 0 })]
		});
		expect(code).toBe(1);
	});

	it("renders skipped-tests count for failed file and in summary (runner.mjs:429 true + 431 true heapMb + 465 totalSkip>0)", async () => {
		// testsSkip=3  → line 429 TRUE  (adds "3 skipped" to testCounts)
		// heapMb=256   → line 431 TRUE  (adds heapMb to statsInfo in failed file row)
		// totalTestsSkip = 3 > 0 → line 465 TRUE (adds skipped part to summary Tests line)
		const code = await run({
			...QUIET_BASE,
			testDir: path.join(FIXTURES, "passing"),
			_testResultsOverride: [makeResult({ code: 1, testsFail: 1, testsPass: 0, testsSkip: 3, heapMb: 256 })]
		});
		expect(code).toBe(1);
	});

	it("renders error details block for failed file when showErrorDetails is true (runner.mjs:435 true)", async () => {
		// showErrorDetails: true + r.errors.length > 0 → the indented error-details block renders
		const code = await run({
			...QUIET_BASE,
			showErrorDetails: true,
			testDir: path.join(FIXTURES, "passing"),
			_testResultsOverride: [
				makeResult({
					code: 1,
					testsFail: 1,
					errors: ["FAIL tests/fixtures/passing/a.test.vitest.mjs\n  Error: something broke"]
				})
			]
		});
		expect(code).toBe(1);
	});

	it("hides the passed-files section when suppressPassingFiles is true", async () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		try {
			const code = await run({
				...QUIET_BASE,
				suppressPassingFiles: true,
				testDir: path.join(FIXTURES, "passing"),
				_testResultsOverride: [makeResult({ testsPass: 1 })]
			});
			expect(code).toBe(0);
			const printed = logSpy.mock.calls.map((entry) => String(entry[0] ?? "")).join("\n");
			expect(printed).not.toContain("PASSED TEST FILES");
		} finally {
			logSpy.mockRestore();
		}
	});

	it("hides top summary text sections when topSummary is false", async () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		try {
			const code = await run({
				...QUIET_BASE,
				topSummary: false,
				testDir: path.join(FIXTURES, "passing"),
				_testResultsOverride: [makeResult({ testsPass: 1, heapMb: 128 })]
			});
			expect(code).toBe(0);
			const printed = logSpy.mock.calls.map((entry) => String(entry[0] ?? "")).join("\n");
			expect(printed).not.toContain("TOP MEMORY USERS");
			expect(printed).not.toContain("TOP DURATION");
		} finally {
			logSpy.mockRestore();
		}
	});

	it("returns standard JSON with heap aggregates and top summary arrays by default", async () => {
		const report = await run({
			...QUIET_BASE,
			json: true,
			testDir: path.join(FIXTURES, "passing"),
			_testResultsOverride: [
				makeResult({ file: "tests/fixtures/passing/a.test.vitest.mjs", heapMb: 256, duration: 2000 }),
				makeResult({ file: "tests/fixtures/passing/b.test.vitest.mjs", heapMb: 128, duration: 1000 })
			]
		});
		expect(report.heap.maxHeapMb).toBe(256);
		expect(report.heap.avgHeapMb).toBe(192);
		expect(report).toHaveProperty("topMemoryUsers");
		expect(report).toHaveProperty("topDuration");
	});

	it("omits standard JSON top summary arrays when topSummary is false", async () => {
		const report = await run({
			...QUIET_BASE,
			json: true,
			topSummary: false,
			testDir: path.join(FIXTURES, "passing"),
			_testResultsOverride: [makeResult({ heapMb: 256 })]
		});
		expect(report).not.toHaveProperty("topMemoryUsers");
		expect(report).not.toHaveProperty("topDuration");
	});
});

describe("run() — coverage json topSummary", () => {
	it("includes top summary arrays in coverage JSON by default", async () => {
		const coverageDir = path.join(CWD, "tmp", "test-coverage-json-top-summary-on");
		const report = await run({
			...QUIET_BASE,
			testDir: path.join(FIXTURES, "heap-output"),
			json: true,
			vitestArgs: ["--coverage", "--coverage.provider=v8", `--coverage.reportsDirectory=${coverageDir}`]
		});

		expect(report).toMatchObject({ mode: "coverage", exitCode: 0 });
		expect(report).toHaveProperty("topMemoryUsers");
		expect(report).toHaveProperty("topDuration");
	});

	it("omits top summary arrays in coverage JSON when topSummary is false", async () => {
		const coverageDir = path.join(CWD, "tmp", "test-coverage-json-top-summary-off");
		const report = await run({
			...QUIET_BASE,
			testDir: path.join(FIXTURES, "heap-output"),
			json: true,
			topSummary: false,
			vitestArgs: ["--coverage", "--coverage.provider=v8", `--coverage.reportsDirectory=${coverageDir}`]
		});

		expect(report).toMatchObject({ mode: "coverage", exitCode: 0 });
		expect(report).not.toHaveProperty("topMemoryUsers");
		expect(report).not.toHaveProperty("topDuration");
	});
});

describe("run() — standard mode no-files / vitestArgs passthrough", () => {
	it("logs testPatterns in no-files message when testPatterns is non-empty (runner.mjs:289 true)", async () => {
		// testPatterns provided but no file matches → 'No Vitest test files found matching: …'
		// covers the TRUE branch of the testPatterns.length > 0 ternary on line 289.
		const code = await run({
			...QUIET_BASE,
			testDir: path.join(FIXTURES, "passing"),
			testPatterns: ["nonexistent-xyz-will-never-match"]
		});
		expect(code).toBe(1);
	});

	it("logs vitestArgs passthrough when vitestArgs is non-empty (runner.mjs:307 true)", async () => {
		// vitestArgs.length > 0 → line 307 console.log('🔧 Vitest args') is executed.
		const code = await run({
			...QUIET_BASE,
			testDir: path.join(FIXTURES, "passing"),
			vitestArgs: ["--reporter=verbose"]
		});
		expect(code).toBe(0);
	});
});

describe("run() — per-file heapMb display (real spawn)", () => {
	it("shows heap info in per-file PASSED line in standard mode (runner.mjs:330 true)", async () => {
		// The heap-output fixture emits '512 MB heap used' so parseVitestOutput returns
		// heapMb=512.  This covers the truthy branch of `result.heapMb ?` in runTestFile.
		const code = await run({
			...QUIET_BASE,
			testDir: path.join(FIXTURES, "heap-output")
		});
		expect(code).toBe(0);
	});

	it("shows heap info in per-file PASSED line in coverage mode (runner.mjs:217 true)", async () => {
		// Same fixture, but run through coverage (blob) mode with coverageQuiet:false so the
		// per-file display block executes.  heapMb non-null covers line 217 truthy branch.
		const coverageDir = path.join(CWD, "tmp", "test-coverage-heap-display");
		const code = await run({
			cwd: CWD,
			testDir: path.join(FIXTURES, "heap-output"),
			coverageQuiet: false,
			vitestConfig: path.join(FIXTURES, "vitest.config.mjs"),
			vitestArgs: ["--coverage", "--coverage.provider=v8", `--coverage.reportsDirectory=${coverageDir}`]
		});
		expect(code).toBe(0);
	});
});

describe("run() — coverage mode testPatterns no-files message (runner.mjs:154)", () => {
	it("logs testPatterns in no-files message when coverage mode + no matching files", async () => {
		// hasCoverage=true, testPatterns provided but no matches
		// → the TRUE branch of testPatterns.length > 0 ternary on line 154.
		const code = await run({
			cwd: CWD,
			testDir: path.join(FIXTURES, "passing"),
			coverageQuiet: true,
			vitestConfig: path.join(FIXTURES, "vitest.config.mjs"),
			vitestArgs: ["--coverage", "--coverage.provider=v8"],
			testPatterns: ["nonexistent-xyz-will-never-match"]
		});
		expect(code).toBe(1);
	});
});

describe("run() — coverageQuiet + --coverage already in vitestArgs (runner.mjs:134/138)", () => {
	it("skips unshift when coverageQuiet is true and --coverage is already in vitestArgs", async () => {
		// coverageQuiet:true && some(a => a==='--coverage') is TRUE
		// → !some(...) = FALSE → the unshift is skipped (line 134 binary-expr false branch)
		// This also covers the a==='--coverage' true short-circuit in the some() at line 138.
		const coverageDir = path.join(CWD, "tmp", "test-coverage-no-double-unshift");
		const code = await run({
			cwd: CWD,
			testDir: path.join(FIXTURES, "passing"),
			coverageQuiet: true,
			vitestConfig: path.join(FIXTURES, "vitest.config.mjs"),
			vitestArgs: ["--coverage", "--coverage.provider=v8", `--coverage.reportsDirectory=${coverageDir}`]
		});
		expect(code).toBe(0);
	});

	it("skips unshift when coverageQuiet is true and vitestArgs has only a dotted --coverage.* arg (runner.mjs:134 startsWith branch)", async () => {
		// coverageQuiet:true + vitestArgs has --coverage.enabled=true but NOT plain --coverage
		// → some() checks: a==="--coverage" (false) then a.startsWith("--coverage.") (TRUE)
		// → !some() = false → unshift is skipped; the startsWith("--coverage.") branch is hit
		const coverageDir = path.join(CWD, "tmp", "test-coverage-dotted-only");
		const code = await run({
			cwd: CWD,
			testDir: path.join(FIXTURES, "passing"),
			coverageQuiet: true,
			vitestConfig: path.join(FIXTURES, "vitest.config.mjs"),
			vitestArgs: ["--coverage.enabled=true", "--coverage.provider=v8", `--coverage.reportsDirectory=${coverageDir}`]
		});
		expect(code).toBe(0);
	});
});

describe("run() — VITEST_HEAP_MB environment variable (runner.mjs:122)", () => {
	it("picks up maxOldSpaceMb from VITEST_HEAP_MB when opts.maxOldSpaceMb is not set", async () => {
		// opts.maxOldSpaceMb is undefined → ?? evaluates right side
		// process.env.VITEST_HEAP_MB is truthy → parseInt branch is taken (runner.mjs:122)
		const saved = process.env.VITEST_HEAP_MB;
		process.env.VITEST_HEAP_MB = "2048";
		try {
			const code = await run({
				...QUIET_BASE,
				testDir: path.join(FIXTURES, "passing")
			});
			expect(code).toBe(0);
		} finally {
			if (saved === undefined) delete process.env.VITEST_HEAP_MB;
			else process.env.VITEST_HEAP_MB = saved;
		}
	});
});

describe("run() — scratch directory lifecycle (VITEST_RUNNER_TMP / keepTmp / scratchDir)", () => {
	it("exposes a per-file scratch dir via VITEST_RUNNER_TMP and removes the run root on completion", async () => {
		const scratchDir = path.join("tmp", "scratch-lifecycle-default");
		const markerFile = path.join(CWD, "tmp", "scratch-lifecycle-default-marker.json");
		process.env.SCRATCH_CHECK_MARKER_FILE = markerFile;

		let code;
		try {
			code = await run({
				...QUIET_BASE,
				testDir: path.join(FIXTURES, "scratch-check"),
				scratchDir
			});
		} finally {
			delete process.env.SCRATCH_CHECK_MARKER_FILE;
		}
		expect(code).toBe(0);

		// makeRunTmpDir's mkdtemp result lives one level below VITEST_RUNNER_TMP
		// (the per-file worker dir), which lives one level below the run root.
		const { dir: mkdtempDir } = JSON.parse(await fs.readFile(markerFile, "utf8"));
		const workerDir = path.dirname(mkdtempDir);
		const runRoot = path.dirname(workerDir);
		const scratchBase = path.dirname(runRoot);
		expect(scratchBase).toBe(path.resolve(CWD, scratchDir));
		// The run root (and everything under it, including the worker dir) is
		// removed once run() completes — the default keepTmp: false behavior.
		await expect(fs.access(runRoot)).rejects.toThrow();
		await fs.rm(markerFile, { force: true });
	});

	it("keeps the scratch root when keepTmp is true", async () => {
		const scratchDir = path.join("tmp", "scratch-lifecycle-keep");
		const markerFile = path.join(CWD, "tmp", "scratch-lifecycle-keep-marker.json");
		process.env.SCRATCH_CHECK_MARKER_FILE = markerFile;

		let code;
		try {
			code = await run({
				...QUIET_BASE,
				testDir: path.join(FIXTURES, "scratch-check"),
				scratchDir,
				keepTmp: true
			});
		} finally {
			delete process.env.SCRATCH_CHECK_MARKER_FILE;
		}
		expect(code).toBe(0);

		const { dir: mkdtempDir } = JSON.parse(await fs.readFile(markerFile, "utf8"));
		const runRoot = path.dirname(path.dirname(mkdtempDir));

		await expect(fs.access(runRoot)).resolves.toBeUndefined();
		await fs.rm(path.resolve(CWD, scratchDir), { recursive: true, force: true });
		await fs.rm(markerFile, { force: true });
	});

	it("sweeps stale scratch roots left by a dead process before creating this run's root", async () => {
		const scratchDir = path.join("tmp", "scratch-lifecycle-sweep");
		const base = path.resolve(CWD, scratchDir);
		const staleRoot = path.join(base, "999999999-123");
		await fs.mkdir(staleRoot, { recursive: true });

		const code = await run({
			...QUIET_BASE,
			testDir: path.join(FIXTURES, "passing"),
			scratchDir
		});
		expect(code).toBe(0);

		await expect(fs.access(staleRoot)).rejects.toThrow();
		await fs.rm(base, { recursive: true, force: true });
	});

	it("removes the scratch root and sets exitCode 130 on SIGINT", async () => {
		const scratchDir = path.join("tmp", "scratch-lifecycle-sigint");
		// process.emit (not a real OS signal) invokes the registered listener
		// synchronously without actually terminating this test process; process.exit
		// is mocked so the listener's own process.exit() call is a no-op here too.
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {});
		const savedExitCode = process.exitCode;

		const runPromise = run({
			...QUIET_BASE,
			testDir: path.join(FIXTURES, "passing"),
			scratchDir
		});

		// Let sweepStaleScratchRoots/createRunScratchRoot (real fs ops, dispatched via
		// libuv's threadpool — not microtask-resolved) settle and the SIGINT listener
		// register, well before the real child vitest spawn completes.
		await new Promise((resolve) => setTimeout(resolve, 100));
		process.emit("SIGINT");

		expect(process.exitCode).toBe(130);
		expect(exitSpy).toHaveBeenCalledOnce();

		await runPromise;
		exitSpy.mockRestore();
		process.exitCode = savedExitCode;
		await fs.rm(path.resolve(CWD, scratchDir), { recursive: true, force: true });
	});
});
