/**
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/utils/resolve.test.vitest.mjs
 *	@Date: 2026-02-24T23:27:21-08:00 (1772004441)
 *	@Author: Shinrai <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Shinrai <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-09-27 08:51:33 -07:00 (1790524293)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 */

/**
 * @fileoverview Unit tests for src/utils/resolve.mjs
 */
import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBin, resolveVitestConfig } from "../../src/utils/resolve.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Absolute path to the vitest-runner package root */
const PKG_ROOT = path.resolve(__dirname, "../..");

describe("resolveVitestConfig", () => {
	it("returns an explicit absolute path unchanged", async () => {
		const abs = "/some/absolute/vitest.config.ts";
		const result = await resolveVitestConfig(PKG_ROOT, abs);
		expect(result).toBe(abs);
	});

	it("resolves an explicit relative path against cwd", async () => {
		const result = await resolveVitestConfig(PKG_ROOT, ".configs/vitest.config.mjs");
		expect(result).toBe(path.join(PKG_ROOT, ".configs/vitest.config.mjs"));
	});

	it("auto-detects vitest.config.mjs in the fixtures directory", async () => {
		// tests/fixtures/ has its own vitest.config.mjs — use it to exercise auto-detection
		const fixturesDir = path.join(PKG_ROOT, "tests", "fixtures");
		const result = await resolveVitestConfig(fixturesDir, undefined);
		expect(result).toBe(path.join(fixturesDir, "vitest.config.mjs"));
	});

	it("returns undefined when no config file is found", async () => {
		// Use a directory with no config files
		const result = await resolveVitestConfig(path.join(PKG_ROOT, "tests"), undefined);
		expect(result).toBeUndefined();
	});
});

describe("resolveBin", () => {
	it("resolves the vitest bin from the package root", () => {
		const binPath = resolveBin(PKG_ROOT, "vitest");
		expect(path.isAbsolute(binPath)).toBe(true);
		expect(binPath).toContain("vitest");
	});

	it("throws when the package does not exist", () => {
		expect(() => resolveBin(PKG_ROOT, "non-existent-package-xyz")).toThrow();
	});

	it("throws when the package exists but has no bin field", () => {
		// `@vitest/coverage-v8` is a library with no CLI binary — exercises the !rel throw path
		expect(() => resolveBin(PKG_ROOT, "@vitest/coverage-v8")).toThrow(/No bin/);
	});
});
