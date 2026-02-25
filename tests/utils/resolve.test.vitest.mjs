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
		const result = await resolveVitestConfig(PKG_ROOT, "vitest.config.mjs");
		expect(result).toBe(path.join(PKG_ROOT, "vitest.config.mjs"));
	});

	it("auto-detects vitest.config.mjs in the package root", async () => {
		const result = await resolveVitestConfig(PKG_ROOT, undefined);
		expect(result).toBe(path.join(PKG_ROOT, "vitest.config.mjs"));
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
