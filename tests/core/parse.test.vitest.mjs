/**
 * @fileoverview Unit tests for src/core/parse.mjs
 */
import { describe, it, expect } from "vitest";
import { parseVitestOutput, deduplicateErrors } from "../../src/core/parse.mjs";

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal Vitest "all passing" output string. */
function passingOutput(filesPass = 1, testsPass = 3, durationS = 1.2, heapMb = 64) {
	return [
		`Test Files  ${filesPass} passed (${filesPass})`,
		`     Tests  ${testsPass} passed (${testsPass})`,
		`  Duration  ${durationS}s`,
		`  ${heapMb} MB heap used`
	].join("\n");
}

/** Build a minimal failed output string. */
function failingOutput() {
	return [
		"Test Files  1 failed | 2 passed (3)",
		"     Tests  1 failed | 4 passed (5)",
		"  Duration  2.5s",
		"Failed Tests",
		" FAIL tests/something.test.vitest.mjs > it fails",
		"   AssertionError: expected 1 to be 2",
		" Test Files  1 failed"
	].join("\n");
}

// ─── parseVitestOutput ────────────────────────────────────────────────────────

describe("parseVitestOutput", () => {
	it("returns zeroed result for empty output", () => {
		const result = parseVitestOutput("");
		expect(result.testFilesPass).toBe(0);
		expect(result.testFilesFail).toBe(0);
		expect(result.testsPass).toBe(0);
		expect(result.testsFail).toBe(0);
		expect(result.testsSkip).toBe(0);
		expect(result.duration).toBe(0);
		expect(result.heapMb).toBeNull();
		expect(result.errors).toEqual([]);
	});

	it("parses passing test file counts", () => {
		const result = parseVitestOutput(passingOutput(2, 8));
		expect(result.testFilesPass).toBe(2);
		expect(result.testFilesFail).toBe(0);
	});

	it("parses passing individual test counts", () => {
		const result = parseVitestOutput(passingOutput(1, 5));
		expect(result.testsPass).toBe(5);
		expect(result.testsFail).toBe(0);
	});

	it("parses duration in seconds to milliseconds", () => {
		const result = parseVitestOutput(passingOutput(1, 1, 2.5));
		expect(result.duration).toBeCloseTo(2500);
	});

	it("parses heap usage in MB", () => {
		const result = parseVitestOutput(passingOutput(1, 1, 1.0, 128));
		expect(result.heapMb).toBe(128);
	});

	it("returns null heapMb when not reported", () => {
		const result = parseVitestOutput("Test Files  1 passed (1)\n     Tests  1 passed (1)");
		expect(result.heapMb).toBeNull();
	});

	it("parses failed file and test counts", () => {
		const result = parseVitestOutput(failingOutput());
		expect(result.testFilesFail).toBe(1);
		expect(result.testFilesPass).toBe(2);
		expect(result.testsFail).toBe(1);
		expect(result.testsPass).toBe(4);
	});

	it("parses skipped test count", () => {
		const output = "     Tests  2 skipped | 3 passed (5)";
		const result = parseVitestOutput(output);
		expect(result.testsSkip).toBe(2);
		expect(result.testsPass).toBe(3);
	});

	it("strips ANSI codes when counting (handles coloured output)", () => {
		const coloured = "\x1B[32mTest Files\x1B[0m  1 passed (1)";
		const result = parseVitestOutput(coloured);
		expect(result.testFilesPass).toBe(1);
	});

	it("extracts multiple consecutive error blocks (multi-match branch)", () => {
		// Two FAIL lines in the error section exercises i < matches.length - 1 branch
		const block = [
			"Failed Tests ───",
			" FAIL tests/a.test.vitest.mjs",
			"  AssertionError: first",
			" FAIL tests/b.test.vitest.mjs",
			"  AssertionError: second"
		].join("\n");
		const output = block + "\n Test Files  2 failed (2)\n      Tests  2 failed (2)";
		const result = parseVitestOutput(output);
		expect(result.errors.length).toBe(2);
		expect(result.errors[0]).toContain("tests/a.test");
		expect(result.errors[1]).toContain("tests/b.test");
	});

	it("handles error block with no preceding newline (lineStart === -1 branch)", () => {
		// "FAIL tests/" immediately after "Failed Tests" with no intervening newline
		const output = "Failed TestsFAIL tests/no-newline.test.vitest.mjs AssertionError: x" + " Test Files  1 failed (1)";
		const result = parseVitestOutput(output);
		expect(result.errors.length).toBeGreaterThanOrEqual(1);
		expect(result.errors[0]).toContain("tests/no-newline");
	});
});

// ─── deduplicateErrors ────────────────────────────────────────────────────────

describe("deduplicateErrors", () => {
	it("returns empty string for empty array", () => {
		expect(deduplicateErrors([])).toBe("");
	});

	it("returns error text unchanged when there are no duplicates", () => {
		const errors = ["FAIL tests/foo.test.vitest.mjs\n  AssertionError: x"];
		expect(deduplicateErrors(errors)).toContain("FAIL");
	});

	it("does not collapse lines that lack Config:", () => {
		const errors = ["FAIL tests/a.test.vitest.mjs\nsome error", "FAIL tests/b.test.vitest.mjs\nanother error"];
		const result = deduplicateErrors(errors);
		expect(result).toContain("tests/a.test.vitest.mjs");
		expect(result).toContain("tests/b.test.vitest.mjs");
	});

	it("collapses duplicate FAIL lines that differ only by Config:", () => {
		const line1 = "FAIL tests/foo.test.vitest.mjs Config: 'configA' › suite";
		const line2 = "FAIL tests/foo.test.vitest.mjs Config: 'configB' › suite";
		const result = deduplicateErrors([`${line1}\n${line2}`]);
		// The second line should be collapsed
		const lines = result.split("\n").filter(Boolean);
		const failLines = lines.filter((l) => l.includes("FAIL") && l.includes("Config:"));
		expect(failLines.length).toBe(1);
		expect(failLines[0]).toContain("configA");
		expect(failLines[0]).toContain("configB");
	});
});
