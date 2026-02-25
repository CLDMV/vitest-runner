/**
 * @fileoverview Integration tests for the run() API.
 *
 * These tests spawn real child vitest processes against the fixture test files
 * in tests/fixtures/, exercising the full run() orchestration loop.
 *
 * Each test is slow (~2–5 s) due to vitest startup overhead — testTimeout is
 * set to 30 s in vitest.config.mjs.
 */
import { describe, it, expect } from "vitest";
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
			perFileHeapOverrides: [{ pattern: "a.test", heapMb: 512 }],
			// maxOldSpaceMb intentionally omitted
		});
		expect(code).toBe(0);
	});
});

