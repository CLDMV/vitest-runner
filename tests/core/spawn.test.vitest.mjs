/**
 * @fileoverview Unit and integration tests for src/core/spawn.mjs
 *
 * Tests cover:
 *  - runSingleFile: normal execution and the child.on("error") path
 *  - runVitestDirect: direct vitest invocation (all files, inherited stdio)
 *  - buildBaseArgs: config args presence/absence (tested indirectly)
 */
import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runSingleFile, runVitestDirect } from "../../src/core/spawn.mjs";
import { resolveBin } from "../../src/utils/resolve.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "../..");
const FIXTURES = path.join(PKG_ROOT, "tests", "fixtures");
const FIXTURE_CONFIG = path.join(FIXTURES, "vitest.config.mjs");

// ─── runSingleFile ────────────────────────────────────────────────────────────

describe("runSingleFile", () => {
	it("runs a passing fixture and returns code 0", async () => {
		const vitestBin = resolveBin(PKG_ROOT, "vitest", "vitest");
		const result = await runSingleFile(
			"tests/fixtures/passing/a.test.vitest.mjs",
			{
				cwd: PKG_ROOT,
				vitestBin,
				vitestConfig: FIXTURE_CONFIG,
			},
		);
		expect(result.code).toBe(0);
		expect(result.testFilesPass).toBeGreaterThanOrEqual(1);
	});

	it("runs a failing fixture and returns code 1", async () => {
		const vitestBin = resolveBin(PKG_ROOT, "vitest", "vitest");
		const result = await runSingleFile(
			"tests/fixtures/failing/broken.test.vitest.mjs",
			{
				cwd: PKG_ROOT,
				vitestBin,
				vitestConfig: FIXTURE_CONFIG,
			},
		);
		expect(result.code).toBe(1);
	});

	it("resolves with code 1 on child process error (invalid binary)", async () => {
		// Triggers the child.on("error") handler path
		const result = await runSingleFile(
			"tests/fixtures/passing/a.test.vitest.mjs",
			{
				cwd: PKG_ROOT,
				vitestBin: "/nonexistent/path/to/vitest",
			},
		);
		expect(result.code).toBe(1);
	});
});

// ─── runVitestDirect ──────────────────────────────────────────────────────────

describe("runVitestDirect", () => {
	it("runs all files directly and returns 0 for a pass-only directory", async () => {
		const vitestBin = resolveBin(PKG_ROOT, "vitest", "vitest");
		const code = await runVitestDirect({
			cwd: PKG_ROOT,
			vitestBin,
			vitestConfig: FIXTURE_CONFIG,
			vitestArgs: ["tests/fixtures/passing/a.test.vitest.mjs"],
		});
		expect(code).toBe(0);
	});

	it("returns 1 when run against a failing fixture", async () => {
		const vitestBin = resolveBin(PKG_ROOT, "vitest", "vitest");
		const code = await runVitestDirect({
			cwd: PKG_ROOT,
			vitestBin,
			vitestConfig: FIXTURE_CONFIG,
			vitestArgs: ["tests/fixtures/failing/broken.test.vitest.mjs"],
		});
		expect(code).toBe(1);
	});
});
