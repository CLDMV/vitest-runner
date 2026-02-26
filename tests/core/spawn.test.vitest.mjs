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
import { runSingleFile, runVitestDirect, runMergeReports } from "../../src/core/spawn.mjs";
import { resolveBin } from "../../src/utils/resolve.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "../..");
const FIXTURES = path.join(PKG_ROOT, "tests", "fixtures");
const FIXTURE_CONFIG = path.join(FIXTURES, "vitest.config.mjs");

// ─── runSingleFile ────────────────────────────────────────────────────────────

describe("runSingleFile", () => {
	it("runs a passing fixture and returns code 0", async () => {
		const vitestBin = resolveBin(PKG_ROOT, "vitest", "vitest");
		const result = await runSingleFile("tests/fixtures/passing/a.test.vitest.mjs", {
			cwd: PKG_ROOT,
			vitestBin,
			vitestConfig: FIXTURE_CONFIG
		});
		expect(result.code).toBe(0);
		expect(result.testFilesPass).toBeGreaterThanOrEqual(1);
	});

	it("runs a failing fixture and returns code 1", async () => {
		const vitestBin = resolveBin(PKG_ROOT, "vitest", "vitest");
		const result = await runSingleFile("tests/fixtures/failing/broken.test.vitest.mjs", {
			cwd: PKG_ROOT,
			vitestBin,
			vitestConfig: FIXTURE_CONFIG
		});
		expect(result.code).toBe(1);
	});

	it("resolves with code 1 on child process error (invalid binary)", async () => {
		// The invalid vitestBin is passed as an arg to node, which starts successfully
		// but exits with code 1 (node can't load the script) — goes through close, not error
		const result = await runSingleFile("tests/fixtures/passing/a.test.vitest.mjs", {
			cwd: PKG_ROOT,
			vitestBin: "/nonexistent/path/to/vitest"
		});
		expect(result.code).toBe(1);
	});

	it("accumulates stderr without forwarding to process.stderr when streamOutput is false (spawn.mjs:103 branch)", async () => {
		// The fixture uses console.error() which goes to the child's stderr.
		// With streamOutput: false the child.stderr.on("data") handler fires (accumulating
		// stderr into the output string) but does NOT call process.stderr.write —
		// this exercises the FALSE arm of the `if (streamOutput)` branch at line 103.
		const vitestBin = resolveBin(PKG_ROOT, "vitest", "vitest");
		const result = await runSingleFile("tests/fixtures/stderr/stderr.test.vitest.mjs", {
			cwd: PKG_ROOT,
			vitestBin,
			vitestConfig: FIXTURE_CONFIG,
			streamOutput: false
		});
		expect(result.code).toBe(0);
		// The stderr marker should be captured in rawOutput
		expect(result.rawOutput).toMatch(/test-stderr-marker/);
	});

	it("resolves with code 1 via child.on('error') when cwd does not exist (spawn.mjs:127)", async () => {
		// spawn() with a non-existent cwd emits ENOENT via the 'error' event — not 'close'
		// This exercises the child.on("error") handler body at spawn.mjs:127
		const vitestBin = resolveBin(PKG_ROOT, "vitest", "vitest");
		const result = await runSingleFile("tests/fixtures/passing/a.test.vitest.mjs", {
			cwd: "/nonexistent/directory/that/does/not/exist/abc123",
			vitestBin
		});
		expect(result.code).toBe(1);
		expect(result.testFilesFail).toBe(1);
		expect(result.errors[0]).toMatch(/ENOENT|spawn/i);
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
			vitestArgs: ["tests/fixtures/passing/a.test.vitest.mjs"]
		});
		expect(code).toBe(0);
	});

	it("returns 1 when run against a failing fixture", async () => {
		const vitestBin = resolveBin(PKG_ROOT, "vitest", "vitest");
		const code = await runVitestDirect({
			cwd: PKG_ROOT,
			vitestBin,
			vitestConfig: FIXTURE_CONFIG,
			vitestArgs: ["tests/fixtures/failing/broken.test.vitest.mjs"]
		});
		expect(code).toBe(1);
	});

	it("resolves with code 1 via child.on('error') when cwd does not exist (spawn.mjs:165)", async () => {
		// Passing an invalid cwd to runVitestDirect triggers the OS-level ENOENT error
		// which fires child.on('error'), exercising the () => resolve(1) handler at line 165.
		const vitestBin = resolveBin(PKG_ROOT, "vitest", "vitest");
		const code = await runVitestDirect({
			cwd: "/nonexistent/path/abc123xyz",
			vitestBin
		});
		expect(code).toBe(1);
	});
});

// ─── runMergeReports ──────────────────────────────────────────────────────────

describe("runMergeReports", () => {
	it("resolves with exitCode 1 via child.on('error') when cwd does not exist (spawn.mjs:216)", async () => {
		// Passing an invalid cwd triggers OS-level ENOENT, firing the error handler at line 216.
		const vitestBin = resolveBin(PKG_ROOT, "vitest", "vitest");
		const { exitCode } = await runMergeReports("/some/blobs/dir", {
			cwd: "/nonexistent/path/abc123xyz",
			vitestBin
		});
		expect(exitCode).toBe(1);
	});

	it("invokes the stderr data callback in quietOutput mode when vitest produces stderr (spawn.mjs:212)", async () => {
		// With quietOutput:true stdio is piped. Pointing to a non-existent blobs dir causes
		// vitest --mergeReports to fail and write an error to stderr, firing the
		// child.stderr.on("data") callback at spawn.mjs:212.
		const vitestBin = resolveBin(PKG_ROOT, "vitest", "vitest");
		const { exitCode } = await runMergeReports("/nonexistent/blobs/123", {
			cwd: PKG_ROOT,
			vitestBin,
			quietOutput: true
		});
		expect(exitCode).toBe(1);
	});
});

// ─── buildEnv NODE_ENV fallback ───────────────────────────────────────────────

describe("buildEnv NODE_ENV fallback", () => {
	it("sets NODE_ENV from nodeEnv option when process.env.NODE_ENV is absent (spawn.mjs:27)", async () => {
		// Temporarily remove NODE_ENV so buildEnv's `if (!env.NODE_ENV)` branch fires.
		const saved = process.env.NODE_ENV;
		delete process.env.NODE_ENV;
		try {
			const vitestBin = resolveBin(PKG_ROOT, "vitest", "vitest");
			const result = await runSingleFile("tests/fixtures/passing/a.test.vitest.mjs", {
				cwd: PKG_ROOT,
				vitestBin,
				vitestConfig: FIXTURE_CONFIG,
				nodeEnv: "production"
			});
			expect(result.code).toBe(0);
		} finally {
			process.env.NODE_ENV = saved;
		}
	});
});

// ─── Signal-based (null exit code) branch coverage ───────────────────────────
// These tests use a tiny stand-in script that kills itself with SIGTERM so the
// child process close event fires with code=null, covering the `code ?? 1`
// fallbacks in spawn.mjs (lines 113, 164, 215).

/** Absolute path to the self-signalling stand-in binary. */
const SIGNAL_SELF = path.join(PKG_ROOT, "tests/fixtures/signal-exit/signal-self.mjs");

describe("runSingleFile — signal exit (null code)", () => {
	it("resolves with code 1 when child exits via signal (spawn.mjs:113 code??1 + spawn.mjs:114 spawnDuration fallback)", async () => {
		// The stand-in binary immediately sends SIGTERM to itself.
		// • close fires with code=null  → code ?? 1  = 1  (spawn.mjs:113)
		// • The child emits no Duration line → parsed.duration === 0
		//   → duration falls back to spawnDuration              (spawn.mjs:114)
		const result = await runSingleFile("tests/fixtures/signal-exit/signal-self.mjs", {
			cwd: PKG_ROOT,
			vitestBin: SIGNAL_SELF
		});
		expect(result.code).toBe(1);
		expect(result.duration).toBeGreaterThan(0); // spawnDuration fallback was used
	});
});

describe("runVitestDirect — signal exit (null code)", () => {
	it("resolves with code 1 when child exits via signal (spawn.mjs:164 code??1)", async () => {
		// Same stand-in binary kills itself → close with code=null → code ?? 1 = 1 (spawn.mjs:164)
		const code = await runVitestDirect({
			cwd: PKG_ROOT,
			vitestBin: SIGNAL_SELF
		});
		expect(code).toBe(1);
	});
});

describe("runMergeReports — signal exit (null code)", () => {
	it("resolves with exitCode 1 when child exits via signal (spawn.mjs:215 code??1)", async () => {
		// Same stand-in binary kills itself → close with code=null → code ?? 1 = 1 (spawn.mjs:215)
		const { exitCode } = await runMergeReports("/some/blobs/dir", {
			cwd: PKG_ROOT,
			vitestBin: SIGNAL_SELF,
			quietOutput: true // pipe stdio so we don't inherit terminal noise
		});
		expect(exitCode).toBe(1);
	});
});
