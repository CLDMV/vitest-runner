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

// vi.mock is hoisted by vitest — this mock applies to runner.mjs's own import
// of spawn.mjs as well as this test file's direct import.
vi.mock("../../src/core/spawn.mjs", async (importOriginal) => {
	const orig = await importOriginal();
	return {
		...orig,
		runSingleFile: vi.fn()
	};
});

import path from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "../../src/runner.mjs";
import { runSingleFile } from "../../src/core/spawn.mjs";

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
