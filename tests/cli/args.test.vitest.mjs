/**
 * @fileoverview Unit tests for src/cli/args.mjs
 */
import { describe, it, expect } from "vitest";
import { parseArguments } from "../../src/cli/args.mjs";

describe("parseArguments", () => {
	it("returns safe defaults for an empty argument list", () => {
		const result = parseArguments([]);
		expect(result.testListFile).toBeUndefined();
		expect(result.showErrorDetails).toBe(true);
		expect(result.coverageQuiet).toBe(false);
		expect(result.logFile).toBeUndefined();
		expect(result.help).toBe(false);
		expect(result.workers).toBeUndefined();
		expect(result.soloPatterns).toEqual([]);
		expect(result.testFilePattern).toBeUndefined();
		expect(result.vitestPassthroughArgs).toEqual([]);
		expect(result.testPatterns).toEqual([]);
	});

	// ── --test-list ────────────────────────────────────────────────────────────

	it("parses --test-list <file> (space-separated)", () => {
		const result = parseArguments(["--test-list", "my-tests.json"]);
		expect(result.testListFile).toBe("my-tests.json");
	});

	it("parses --test-list=<file> (equals form)", () => {
		const result = parseArguments(["--test-list=path/to/tests.json"]);
		expect(result.testListFile).toBe("path/to/tests.json");
	});

	// ── --workers ─────────────────────────────────────────────────────────────

	it("parses --workers <n> (space-separated) as integer", () => {
		const result = parseArguments(["--workers", "8"]);
		expect(result.workers).toBe(8);
	});

	it("parses --workers=<n> (equals form)", () => {
		const result = parseArguments(["--workers=4"]);
		expect(result.workers).toBe(4);
	});

	// ── --solo-pattern ────────────────────────────────────────────────────────

	it("parses --solo-pattern <pat>", () => {
		const result = parseArguments(["--solo-pattern", "heavy/"]);
		expect(result.soloPatterns).toEqual(["heavy/"]);
	});

	it("parses --solo-pattern=<pat> (equals form)", () => {
		const result = parseArguments(["--solo-pattern=listener-cleanup/"]);
		expect(result.soloPatterns).toEqual(["listener-cleanup/"]);
	});

	it("accumulates multiple --solo-pattern values", () => {
		const result = parseArguments(["--solo-pattern", "heavy/", "--solo-pattern", "listener/"]);
		expect(result.soloPatterns).toEqual(["heavy/", "listener/"]);
	});

	// ── --file-pattern ────────────────────────────────────────────────────────

	it("parses --file-pattern <regex> into a RegExp", () => {
		const result = parseArguments(["--file-pattern", "\\.spec\\.ts$"]);
		expect(result.testFilePattern).toBeInstanceOf(RegExp);
		expect(result.testFilePattern.test("foo.spec.ts")).toBe(true);
	});

	it("parses --file-pattern=<regex> (equals form)", () => {
		const result = parseArguments(["--file-pattern=\\.spec\\.mjs$"]);
		expect(result.testFilePattern).toBeInstanceOf(RegExp);
		expect(result.testFilePattern.test("foo.spec.mjs")).toBe(true);
	});

	it("creates the regex with case-insensitive flag", () => {
		const result = parseArguments(["--file-pattern", "\\.TEST\\.MJS$"]);
		expect(result.testFilePattern.test("foo.test.mjs")).toBe(true);
	});

	// ── --no-error-details ────────────────────────────────────────────────────

	it("sets showErrorDetails to false for --no-error-details", () => {
		const result = parseArguments(["--no-error-details"]);
		expect(result.showErrorDetails).toBe(false);
	});

	// ── --coverage-quiet ──────────────────────────────────────────────────────

	it("sets coverageQuiet to true for --coverage-quiet", () => {
		const result = parseArguments(["--coverage-quiet"]);
		expect(result.coverageQuiet).toBe(true);
	});

	// ── --log-file ────────────────────────────────────────────────────────────

	it("parses --log-file <path>", () => {
		const result = parseArguments(["--log-file", "output/run.log"]);
		expect(result.logFile).toBe("output/run.log");
	});

	it("parses --log-file=<path> (equals form)", () => {
		const result = parseArguments(["--log-file=run.log"]);
		expect(result.logFile).toBe("run.log");
	});

	// ── --help / -h ───────────────────────────────────────────────────────────

	it("sets help to true for --help", () => {
		expect(parseArguments(["--help"]).help).toBe(true);
	});

	it("sets help to true for -h", () => {
		expect(parseArguments(["-h"]).help).toBe(true);
	});

	// ── passthrough args ──────────────────────────────────────────────────────

	it("forwards unrecognised flags to vitestPassthroughArgs", () => {
		const result = parseArguments(["--reporter=verbose"]);
		expect(result.vitestPassthroughArgs).toContain("--reporter=verbose");
	});

	it("consumes a flag value when next token is not a flag", () => {
		const result = parseArguments(["--reporter", "verbose"]);
		expect(result.vitestPassthroughArgs).toEqual(["--reporter", "verbose"]);
	});

	it("does not consume a flag value when next token is also a flag", () => {
		const result = parseArguments(["--bail", "--reporter=verbose"]);
		expect(result.vitestPassthroughArgs).toContain("--bail");
		expect(result.vitestPassthroughArgs).toContain("--reporter=verbose");
	});

	it("forwards -t shorthand vitest flag with value", () => {
		const result = parseArguments(["-t", "my test name"]);
		expect(result.vitestPassthroughArgs).toContain("-t");
		expect(result.vitestPassthroughArgs).toContain("my test name");
	});

	// ── positional test patterns ──────────────────────────────────────────────

	it("collects non-flag arguments as testPatterns", () => {
		const result = parseArguments(["src/tests/config", "src/tests/auth"]);
		expect(result.testPatterns).toEqual(["src/tests/config", "src/tests/auth"]);
	});

	// ── combined ──────────────────────────────────────────────────────────────

	it("handles a realistic combined CLI invocation", () => {
		const result = parseArguments([
			"--test-list",
			"tests.json",
			"--workers",
			"2",
			"--solo-pattern",
			"heavy/",
			"--no-error-details",
			"--reporter=verbose"
		]);
		expect(result.testListFile).toBe("tests.json");
		expect(result.workers).toBe(2);
		expect(result.soloPatterns).toEqual(["heavy/"]);
		expect(result.showErrorDetails).toBe(false);
		expect(result.vitestPassthroughArgs).toContain("--reporter=verbose");
	});
});
