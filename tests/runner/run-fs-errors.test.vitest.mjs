/**
 * @fileoverview Tests for runner.mjs defensive fs error-suppression catch() callbacks.
 *
 * Uses vi.mock("node:fs/promises") with a factory to make specific fs operations
 * reject, triggering the normally-unreachable .catch() callbacks in run().
 *
 * Covered:
 *   runner.mjs:246  — `fs.readdir(blobsDir).catch(() => [])` fallback
 *   runner.mjs:273  — first  `fs.rm(...).catch(() => {})` cleanup callback
 *   runner.mjs:274  — second `fs.rm(...).catch(() => {})` cleanup callback
 */
import { vi, describe, it, expect, afterEach } from "vitest";

// Mock spawn so the tests don't actually spawn child processes.
vi.mock("../../src/core/spawn.mjs", async (importOriginal) => {
	const orig = await importOriginal();
	return { ...orig, runSingleFile: vi.fn() };
});

// Replace node:fs/promises with a module that delegates to the real implementation
// but exposes vi.fn() wrappers for `readdir` and `rm` so individual tests can
// inject one-shot rejections via mockRejectedValueOnce().
vi.mock("node:fs/promises", async (importOriginal) => {
	const orig = await importOriginal();

	// Create stable vi.fn() wrappers that delegate to the real implementation by default.
	const readdirFn = vi.fn((...a) => orig.readdir(...a));
	const rmFn = vi.fn((...a) => orig.rm(...a));
	const mkdirFn = vi.fn((...a) => orig.mkdir(...a));

	// The module object (all named exports + default that mirrors them)
	const mod = {
		...orig,
		readdir: readdirFn,
		rm: rmFn,
		mkdir: mkdirFn,
		default: {
			...orig,
			readdir: readdirFn,
			rm: rmFn,
			mkdir: mkdirFn
		}
	};

	return mod;
});

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "../../src/runner.mjs";
import { runSingleFile } from "../../src/core/spawn.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "../..");
const FIXTURES = path.join(PKG_ROOT, "tests", "fixtures");
const FIXTURE_CONFIG = path.join(FIXTURES, "vitest.config.mjs");

const BASE_COVERAGE = {
	cwd: PKG_ROOT,
	testDir: path.join(FIXTURES, "passing"),
	vitestConfig: FIXTURE_CONFIG,
	coverageQuiet: true,
	vitestArgs: ["--coverage", "--coverage.provider=v8"]
};

afterEach(() => {
	// Clear call counts but keep implementations (mockRejectedValueOnce is consumed by use,
	// so the default delegation to the real fs functions remains for subsequent tests).
	vi.clearAllMocks();
});

// ─── fs.readdir error → () => [] fallback ────────────────────────────────────
describe("run() — fs.readdir().catch() fallback (runner.mjs:246)", () => {
	it("catches readdir rejection and falls back to [], triggering the no-blobs guard", async () => {
		// Get the real readdir so discovery continues to work normally.
		const { readdir: realReaddir } = /** @type {any} */ (await vi.importActual("node:fs/promises"));

		// Allow runSingleFile to resolve (simulating a successful run without writing
		// a real blob to disk — the blobsDir will be empty / readable but contain no blobs).
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

		// Intercept readdir only for the blobsDir check (runner.mjs:246) so that the
		// `.catch(() => [])` callback fires.  All other readdir calls (discoverVitestFiles)
		// continue to use the real implementation.
		vi.mocked(fs.readdir).mockImplementation(async (dir, opts) => {
			if (String(dir).includes(".vitest-coverage-blobs")) {
				throw Object.assign(new Error("ENOENT: readdir failed for blobsDir"), { code: "ENOENT" });
			}
			return realReaddir(dir, opts);
		});

		const code = await run({ ...BASE_COVERAGE });
		// The .catch(() => []) fires → blobFiles = [] → "no blobs" guard → return 1
		expect(code).toBe(1);
	});
});

// ─── fs.rm error → () => {} suppression callbacks ────────────────────────────
describe("run() — fs.rm().catch() suppression callbacks (runner.mjs:273-274)", () => {
	it("swallows rm rejections during cleanup and continues to a numeric exit code", async () => {
		// Get the real fs implementations so we can delegate for non-target calls.
		const { readdir: realReaddir, rm: realRm } = /** @type {any} */ (await vi.importActual("node:fs/promises"));

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

		// Mock readdir conditionally: return a fake blob only for the blobsDir check at
		// runner.mjs:246; all other readdir calls (e.g. discoverVitestFiles) use the real
		// implementation so directory traversal continues to work normally.
		vi.mocked(fs.readdir).mockImplementation(async (dir, opts) => {
			if (String(dir).includes(".vitest-coverage-blobs")) {
				return /** @type {any} */ (["run-0.blob"]);
			}
			return realReaddir(dir, opts);
		});

		// Allow the two pre-phase cleanup rm calls to pass, then reject the two
		// post-merge cleanup rm calls (lines 273-274) to exercise their catch callbacks.
		vi.mocked(fs.rm)
			.mockImplementationOnce(realRm) // pre-phase: rm blobsDir (ok)
			.mockImplementationOnce(realRm) // pre-phase: rm coverageTmpBase (ok)
			.mockRejectedValueOnce(new Error("EPERM: rm blobsDir cleanup")) // line 273
			.mockRejectedValueOnce(new Error("EPERM: rm coverageTmpBase cleanup")); // line 274

		const code = await run({ ...BASE_COVERAGE });
		// run() completed; rm errors were swallowed; exit code is a valid number
		expect(typeof code).toBe("number");
	});
});
