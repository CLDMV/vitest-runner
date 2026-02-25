/**
 * @fileoverview Unit tests for src/core/report.mjs
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	computeSummaryFromFinal,
	printMergeOutput,
	printQuietCoverageFailureDetails,
	printCoverageSummary
} from "../../src/core/report.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "../..");
const TMP_ROOT = path.join(PKG_ROOT, "tmp", "report-tests");

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Capture all console.log / console.error calls within a callback.
 * @param {() => void | Promise<void>} fn
 * @returns {Promise<{logs: string[], errors: string[]}>}
 */
async function captureConsole(fn) {
	const logs = [];
	const errors = [];
	const spyLog = vi.spyOn(console, "log").mockImplementation((...args) => {
		logs.push(args.join(" "));
	});
	const spyErr = vi.spyOn(console, "error").mockImplementation((...args) => {
		errors.push(args.join(" "));
	});
	try {
		await fn();
	} finally {
		spyLog.mockRestore();
		spyErr.mockRestore();
	}
	return { logs, errors };
}

/**
 * Build a minimal coverage-final.json payload for one file.
 * @param {string} filePath
 * @param {{ s: number[], f: number[], b: number[][] }} opts - counts
 * @returns {Record<string, object>}
 */
function makeFinalData(filePath, { s = [1, 1], f = [1], b = [[1, 0]] } = {}) {
	const sObj = Object.fromEntries(s.map((v, i) => [i, v]));
	const fObj = Object.fromEntries(f.map((v, i) => [i, v]));
	const bObj = Object.fromEntries(b.map((v, i) => [i, v]));
	const statementMap = Object.fromEntries(s.map((_, i) => [i, { start: { line: i + 1 }, end: { line: i + 1 } }]));
	return { [filePath]: { s: sObj, f: fObj, b: bObj, statementMap } };
}

// ─── computeSummaryFromFinal ──────────────────────────────────────────────────

describe("computeSummaryFromFinal", () => {
	it("returns a total entry with 100% for an empty dataset", () => {
		const summary = computeSummaryFromFinal({});
		expect(summary.total.statements.pct).toBe(100);
		expect(summary.total.lines.pct).toBe(100);
	});

	it("computes correct statement percentages", () => {
		// s[0]=1 (covered), s[1]=0 (not covered) → 50%
		const data = makeFinalData("/src/foo.mjs", { s: [1, 0], f: [], b: [] });
		const summary = computeSummaryFromFinal(data);
		expect(summary["/src/foo.mjs"].statements.pct).toBe(50);
	});

	it("computes correct function percentages", () => {
		// f[0]=1 (covered), f[1]=0 (not covered) → 50%
		const data = makeFinalData("/src/foo.mjs", { s: [], f: [1, 0], b: [] });
		const summary = computeSummaryFromFinal(data);
		expect(summary["/src/foo.mjs"].functions.pct).toBe(50);
	});

	it("computes correct branch percentages", () => {
		// b[0] = [1, 0] → 1 covered, 1 not → 50%
		const data = makeFinalData("/src/foo.mjs", { s: [], f: [], b: [[1, 0]] });
		const summary = computeSummaryFromFinal(data);
		expect(summary["/src/foo.mjs"].branches.pct).toBe(50);
	});

	it("aggregates totals across multiple files", () => {
		const data = {
			...makeFinalData("/src/a.mjs", { s: [1, 1], f: [], b: [] }),
			...makeFinalData("/src/b.mjs", { s: [1, 0], f: [], b: [] })
		};
		const summary = computeSummaryFromFinal(data);
		// 3 covered out of 4 total → 75%
		expect(summary.total.statements.pct).toBe(75);
	});

	it("handles files with no statements (100% vacuously)", () => {
		const data = makeFinalData("/src/empty.mjs", { s: [], f: [], b: [] });
		const summary = computeSummaryFromFinal(data);
		expect(summary["/src/empty.mjs"].statements.pct).toBe(100);
	});

	it("handles a file entry with missing s/f/b/statementMap fields (nullish coalescing branches)", () => {
		// file entry is almost empty — exercises the `?? {}` and optional-chaining fallbacks
		const data = {
			"/src/barebones.mjs": {
				// s, f, b, statementMap all absent
				statementMap: { 0: { start: { line: null }, end: {} } } // line == null → continue
			}
		};
		const summary = computeSummaryFromFinal(data);
		expect(summary["/src/barebones.mjs"].statements.pct).toBe(100);
		expect(summary["/src/barebones.mjs"].functions.pct).toBe(100);
		expect(summary["/src/barebones.mjs"].branches.pct).toBe(100);
		expect(summary["/src/barebones.mjs"].lines.pct).toBe(100);
	});

	it("handles statementMap entry with null loc (line 114 optional-chain null branch)", () => {
		// loc is null → loc?.start?.line short-circuits to undefined, line == null → continue
		const data = {
			"/src/nullloc.mjs": {
				s: { 0: 1 },
				f: {},
				b: {},
				statementMap: { 0: null }
			}
		};
		const summary = computeSummaryFromFinal(data);
		expect(summary["/src/nullloc.mjs"].lines.pct).toBe(100);
	});

	it("handles statementMap entry where loc.start is null (line 114 second ?. branch)", () => {
		// loc is non-null but loc.start is null → loc?.start?.line short-circuits at .start
		const data = {
			"/src/nullstart.mjs": {
				s: { 0: 1 },
				f: {},
				b: {},
				statementMap: { 0: { start: null } }
			}
		};
		const summary = computeSummaryFromFinal(data);
		expect(summary["/src/nullstart.mjs"].lines.pct).toBe(100);
	});

	it("handles a file entry with no statementMap field (line 114 ?? {} fallback branch)", () => {
		// statementMap is absent → data.statementMap ?? {} uses the {} fallback → empty loop
		const data = {
			"/src/nostatmap.mjs": {
				s: { 0: 1 },
				f: { 0: 1 },
				b: {}
				// statementMap intentionally absent
			}
		};
		const summary = computeSummaryFromFinal(data);
		// No statementMap entries → lines.total = 0 → vacuous 100%
		expect(summary["/src/nostatmap.mjs"].lines.pct).toBe(100);
	});

	it("handles statementMap with valid line but absent s field (line 118 data.s ?? {} branch)", () => {
		// s is absent → data.s ?? {} activates the {} fallback; line is valid so we reach line 118
		const data = {
			"/src/nos.mjs": {
				// s intentionally absent
				f: {},
				b: {},
				statementMap: { 0: { start: { line: 1 }, end: { line: 1 } } }
			}
		};
		const summary = computeSummaryFromFinal(data);
		// statementMap has 1 line entry; no s data → coveredLines=0, totalLines=1 → 0%
		expect(summary["/src/nos.mjs"].lines.pct).toBe(0);
	});
});

// ─── printMergeOutput ─────────────────────────────────────────────────────────

describe("printMergeOutput", () => {
	it("prints the coverage block when exitCode is 0 and marker is present", async () => {
		const output = ["some preamble", "% Coverage report from v8", " File  | Lines |", " foo   |  80%  |"].join("\n");

		const { logs } = await captureConsole(() => printMergeOutput(0, output));
		const all = logs.join("\n");
		expect(all).toContain("% Coverage report from v8");
		expect(all).toContain("foo");
		expect(all).not.toContain("some preamble");
	});

	it("prints nothing to console when marker is absent and exitCode is 0", async () => {
		const { logs } = await captureConsole(() => printMergeOutput(0, "no marker here"));
		expect(logs.join("").trim()).toBe("");
	});

	it("prints an empty coverage block silently (no log) when block is empty", async () => {
		const output = "% Coverage report from v8\nstderr | something";
		const { logs } = await captureConsole(() => printMergeOutput(0, output));
		// block between marker and stderr line is empty
		expect(logs.join("").trim()).toBe("");
	});

	it("writes to console.error when exitCode is non-zero", async () => {
		const { errors } = await captureConsole(() => printMergeOutput(1, "fatal merge error"));
		expect(errors.join("")).toContain("fatal merge error");
	});

	it("does not print empty output to error when exitCode is non-zero", async () => {
		const { errors } = await captureConsole(() => printMergeOutput(1, ""));
		expect(errors.length).toBe(0);
	});
});

// ─── printQuietCoverageFailureDetails ─────────────────────────────────────────

describe("printQuietCoverageFailureDetails", () => {
	it("prints nothing for an empty array", async () => {
		const { logs } = await captureConsole(() => printQuietCoverageFailureDetails([]));
		expect(logs.length).toBe(0);
	});

	it("prints file name and raw output for each failure", async () => {
		const failed = [{ file: "src/foo.test.mjs", code: 1, rawOutput: "AssertionError: x" }];
		const { logs } = await captureConsole(() => printQuietCoverageFailureDetails(failed));
		const all = logs.join("\n");
		expect(all).toContain("src/foo.test.mjs");
		expect(all).toContain("AssertionError: x");
	});

	it("shows a fallback message when rawOutput is empty", async () => {
		const failed = [{ file: "src/bar.test.mjs", code: 1, rawOutput: "" }];
		const { logs } = await captureConsole(() => printQuietCoverageFailureDetails(failed));
		expect(logs.join("")).toContain("no child output captured");
	});
});

// ─── printCoverageSummary ─────────────────────────────────────────────────────

describe("printCoverageSummary", () => {
	let tmpDir;

	beforeEach(async () => {
		tmpDir = path.join(TMP_ROOT, `run-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		await fs.mkdir(tmpDir, { recursive: true });
	});

	afterEach(async () => {
		await fs.rm(tmpDir, { recursive: true, force: true });
	});

	it("prints coverage totals from coverage-summary.json", async () => {
		const summary = {
			total: {
				lines: { pct: 90 },
				statements: { pct: 88 },
				functions: { pct: 85 },
				branches: { pct: 70 }
			},
			"/src/foo.mjs": {
				lines: { pct: 90 },
				statements: { pct: 88 },
				functions: { pct: 85 },
				branches: { pct: 70 }
			}
		};
		await fs.writeFile(path.join(tmpDir, "coverage-summary.json"), JSON.stringify(summary));

		const { logs } = await captureConsole(() => printCoverageSummary(PKG_ROOT, [`--coverage.reportsDirectory=${tmpDir}`], 10));
		const all = logs.join("\n");
		expect(all).toContain("Coverage");
		expect(all).toContain("90");
	});

	it("falls back to coverage-final.json when summary is absent", async () => {
		const finalData = makeFinalData(path.join(PKG_ROOT, "src/foo.mjs"), {
			s: [1, 1],
			f: [1],
			b: []
		});
		await fs.writeFile(path.join(tmpDir, "coverage-final.json"), JSON.stringify(finalData));

		const { logs } = await captureConsole(() => printCoverageSummary(PKG_ROOT, [`--coverage.reportsDirectory=${tmpDir}`], 0));
		expect(logs.join("")).toContain("Coverage");
	});

	it("prints a dim 'no coverage JSON found' notice when neither file exists", async () => {
		const { logs } = await captureConsole(() => printCoverageSummary(PKG_ROOT, [`--coverage.reportsDirectory=${tmpDir}`], 10));
		expect(logs.join("")).toContain("no coverage JSON found");
	});

	it("skips the worst-files table when worstCount is 0", async () => {
		const summary = {
			total: {
				lines: { pct: 100 },
				statements: { pct: 100 },
				functions: { pct: 100 },
				branches: { pct: 100 }
			}
		};
		await fs.writeFile(path.join(tmpDir, "coverage-summary.json"), JSON.stringify(summary));

		const { logs } = await captureConsole(() => printCoverageSummary(PKG_ROOT, [`--coverage.reportsDirectory=${tmpDir}`], 0));
		expect(logs.join("")).not.toContain("WORST COVERAGE");
	});

	it("uses <cwd>/coverage as the default reports directory", async () => {
		// Just verify it doesn't throw with no args — actual reading will fail gracefully
		const { logs } = await captureConsole(() => printCoverageSummary(tmpDir, [], 10));
		expect(logs.join("")).toContain("no coverage JSON found");
	});

	it("resolves a relative reportsDirectory against cwd (line 160 false branch)", async () => {
		// Write coverage-summary.json inside tmpDir, then point at it via a relative path
		const relDir = path.relative(PKG_ROOT, tmpDir);
		const summary = {
			total: { lines: { pct: 100 }, statements: { pct: 100 }, functions: { pct: 100 }, branches: { pct: 100 } }
		};
		await fs.writeFile(path.join(tmpDir, "coverage-summary.json"), JSON.stringify(summary));

		const { logs } = await captureConsole(() => printCoverageSummary(PKG_ROOT, [`--coverage.reportsDirectory=${relDir}`], 0));
		expect(logs.join("")).toContain("Coverage");
	});

	it("shows 'and N more files' line when files exceed worstCount", async () => {
		const files = Array.from({ length: 15 }, (_, i) => [
			`/src/file${i}.mjs`,
			{
				lines: { pct: i * 5 },
				statements: { pct: i * 5 },
				functions: { pct: i * 5 },
				branches: { pct: i * 5 }
			}
		]);
		const summary = {
			total: { lines: { pct: 50 }, statements: { pct: 50 }, functions: { pct: 50 }, branches: { pct: 50 } },
			...Object.fromEntries(files)
		};
		await fs.writeFile(path.join(tmpDir, "coverage-summary.json"), JSON.stringify(summary));

		const { logs } = await captureConsole(() => printCoverageSummary(PKG_ROOT, [`--coverage.reportsDirectory=${tmpDir}`], 10));
		expect(logs.join("")).toContain("and 5 more files");
	});

	it("falls back to 0 when pct fields are absent in the summary (nullish coalescing branches)", async () => {
		// Exercises the `?.pct ?? 0` fallback paths in both fileRows.map and the totals line
		const summary = {
			total: {}, // no lines/statements/functions/branches properties
			"/src/uncoveredFile.mjs": {} // same — no pct fields
		};
		await fs.writeFile(path.join(tmpDir, "coverage-summary.json"), JSON.stringify(summary));

		const { logs } = await captureConsole(() => printCoverageSummary(PKG_ROOT, [`--coverage.reportsDirectory=${tmpDir}`], 10));
		const all = logs.join("\n");
		// Coverage line should render with 0% for all metrics
		expect(all).toContain("Coverage");
		expect(all).toContain("0");
	});
});
