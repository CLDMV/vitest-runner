/**
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/core/discover.test.vitest.mjs
 *	@Date: 2026-02-24T23:27:21-08:00 (1772004441)
 *	@Author: Shinrai <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Shinrai <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-09-27 08:51:31 -07:00 (1790524291)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 */

/**
 * @fileoverview Unit tests for src/core/discover.mjs
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	DEFAULT_TEST_FILE_PATTERN,
	discoverFilesInDir,
	discoverVitestFiles,
	sortWithPriority,
	computeFilterConflicts,
	isExcluded
} from "../../src/core/discover.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "../..");
const FIXTURES_DIR = path.join(PKG_ROOT, "tests", "fixtures");
const TMP_ROOT = path.join(PKG_ROOT, "tmp", "discover-tests");

// ─── DEFAULT_TEST_FILE_PATTERN ────────────────────────────────────────────────

describe("DEFAULT_TEST_FILE_PATTERN", () => {
	it.each([
		["foo.test.vitest.js", true],
		["foo.test.vitest.mjs", true],
		["foo.test.vitest.cjs", true],
		["FOO.TEST.VITEST.MJS", true], // case-insensitive
		["foo.test.vitest.ts", false],
		["foo.spec.mjs", false],
		["foo.test.mjs", false],
		["test.vitest.mjs", false] // needs the double-dot .test.
	])("%s → %s", (name, expected) => {
		expect(DEFAULT_TEST_FILE_PATTERN.test(name)).toBe(expected);
	});
});

// ─── sortWithPriority ─────────────────────────────────────────────────────────

describe("sortWithPriority", () => {
	it("returns empty array for empty input", () => {
		expect(sortWithPriority([])).toEqual([]);
	});

	it("sorts alphabetically when no patterns given", () => {
		const files = ["c.mjs", "a.mjs", "b.mjs"];
		expect(sortWithPriority(files)).toEqual(["a.mjs", "b.mjs", "c.mjs"]);
	});

	it("hoists files matching earlyRunPatterns to the front", () => {
		const files = ["src/normal/a.mjs", "src/heavy/x.mjs", "src/normal/b.mjs"];
		const result = sortWithPriority(files, ["heavy/"]);
		expect(result[0]).toBe("src/heavy/x.mjs");
	});

	it("sorts hoisted files by pattern declaration order, then alpha within group", () => {
		const files = ["src/b-pat1/x.mjs", "src/a-pat2/y.mjs", "src/a-pat1/z.mjs"];
		const result = sortWithPriority(files, ["a-pat1/", "a-pat2/"]);
		// pat1 group first, then pat2 group, then rest
		expect(result[0]).toBe("src/a-pat1/z.mjs");
		expect(result[1]).toBe("src/a-pat2/y.mjs");
		expect(result[2]).toBe("src/b-pat1/x.mjs");
	});

	it("sorts files within the same priority group alphabetically (localeCompare branch)", () => {
		// Both files match the same pattern → same priorityIndex → localeCompare fires
		const files = ["src/heavy/b.mjs", "src/heavy/a.mjs"];
		const result = sortWithPriority(files, ["heavy/"]);
		expect(result[0]).toBe("src/heavy/a.mjs");
		expect(result[1]).toBe("src/heavy/b.mjs");
	});

	it("normalises backslashes when matching patterns", () => {
		const files = ["src\\heavy\\x.mjs", "src\\normal\\a.mjs"];
		const result = sortWithPriority(files, ["heavy/"]);
		expect(result[0]).toContain("heavy");
	});
});

// ─── discoverFilesInDir ───────────────────────────────────────────────────────

// ─── computeFilterConflicts ────────────────────────────────────────────────

describe("computeFilterConflicts", () => {
	it("returns empty conflict lists when no file's path is a substring of another's", () => {
		const files = ["tests/a.test.vitest.mjs", "tests/b.test.vitest.mjs"];
		const conflicts = computeFilterConflicts(files);
		expect(conflicts.get("tests/a.test.vitest.mjs")).toEqual([]);
		expect(conflicts.get("tests/b.test.vitest.mjs")).toEqual([]);
	});

	it("flags a root-level file whose path is a trailing substring of a nested file's path", () => {
		const files = ["tests/contract.test.vitest.mjs", "packages/a/tests/contract.test.vitest.mjs"];
		const conflicts = computeFilterConflicts(files);
		expect(conflicts.get("tests/contract.test.vitest.mjs")).toEqual(["packages/a/tests/contract.test.vitest.mjs"]);
		// The reverse direction is unambiguous: the nested file's longer path is
		// never a substring of the shorter root-level path.
		expect(conflicts.get("packages/a/tests/contract.test.vitest.mjs")).toEqual([]);
	});

	it("flags every colliding file when more than two share a basename+parent-dir tail", () => {
		const files = [
			"tests/contract.test.vitest.mjs",
			"packages/a/tests/contract.test.vitest.mjs",
			"packages/b/tests/contract.test.vitest.mjs"
		];
		const conflicts = computeFilterConflicts(files);
		expect(conflicts.get("tests/contract.test.vitest.mjs")).toEqual([
			"packages/a/tests/contract.test.vitest.mjs",
			"packages/b/tests/contract.test.vitest.mjs"
		]);
	});

	it("normalises backslashes before comparing (Windows-style paths)", () => {
		const files = ["tests\\contract.test.vitest.mjs", "packages\\a\\tests\\contract.test.vitest.mjs"];
		const conflicts = computeFilterConflicts(files);
		expect(conflicts.get("tests\\contract.test.vitest.mjs")).toEqual(["packages\\a\\tests\\contract.test.vitest.mjs"]);
	});

	it("returns an empty map for empty input", () => {
		expect(computeFilterConflicts([]).size).toBe(0);
	});
});

// ─── isExcluded ─────────────────────────────────────────────────────────────

describe("isExcluded", () => {
	it("returns false when excludePatterns is empty or omitted", () => {
		expect(isExcluded("tmp/a.mjs", [])).toBe(false);
		expect(isExcluded("tmp/a.mjs", undefined)).toBe(false);
	});

	it("matches a literal path exactly", () => {
		expect(isExcluded("tmp", ["tmp"])).toBe(true);
		expect(isExcluded("tmp2", ["tmp"])).toBe(false);
	});

	it("matches `**` across path separators", () => {
		expect(isExcluded("tmp/worktree/a.test.vitest.mjs", ["tmp/**"])).toBe(true);
		expect(isExcluded("tmp/", ["tmp/**"])).toBe(true); // prunes the directory itself
		expect(isExcluded("other/a.test.vitest.mjs", ["tmp/**"])).toBe(false);
	});

	it("matches `*` within a single path segment only", () => {
		expect(isExcluded("dist/index.mjs", ["dist/*.mjs"])).toBe(true);
		expect(isExcluded("dist/nested/index.mjs", ["dist/*.mjs"])).toBe(false);
	});

	it("matches `?` as a single character", () => {
		expect(isExcluded("a.mjs", ["?.mjs"])).toBe(true);
		expect(isExcluded("ab.mjs", ["?.mjs"])).toBe(false);
	});

	it("escapes regex metacharacters in the literal portion of a pattern", () => {
		expect(isExcluded("a.mjs", ["a.mjs"])).toBe(true);
		expect(isExcluded("aXmjs", ["a.mjs"])).toBe(false); // "." must be literal, not "any char"
	});

	it("matches when any of several patterns matches", () => {
		expect(isExcluded("dist/x.mjs", ["tmp/**", "dist/**"])).toBe(true);
		expect(isExcluded("src/x.mjs", ["tmp/**", "dist/**"])).toBe(false);
	});
});

describe("discoverFilesInDir", () => {
	it("discovers .mjs fixture files under tests/fixtures/passing", async () => {
		const files = await discoverFilesInDir(path.join(FIXTURES_DIR, "passing"), PKG_ROOT);
		expect(files.length).toBeGreaterThanOrEqual(2);
		expect(files.every((f) => f.endsWith(".mjs"))).toBe(true);
	});

	it("prunes a directory matching an exclude glob (never descends into it)", async () => {
		const files = await discoverFilesInDir(FIXTURES_DIR, PKG_ROOT, DEFAULT_TEST_FILE_PATTERN, ["tests/fixtures/passing/**"]);
		expect(files.some((f) => f.includes("fixtures/passing/"))).toBe(false);
		// sibling fixture directories are unaffected
		expect(files.some((f) => f.includes("fixtures/failing/"))).toBe(true);
	});

	it("excludes an individual file matching an exclude glob", async () => {
		const files = await discoverFilesInDir(path.join(FIXTURES_DIR, "passing"), PKG_ROOT, DEFAULT_TEST_FILE_PATTERN, [
			"tests/fixtures/passing/a.test.vitest.mjs"
		]);
		expect(files.some((f) => f.endsWith("a.test.vitest.mjs"))).toBe(false);
		expect(files.some((f) => f.endsWith("b.test.vitest.mjs"))).toBe(true);
	});

	it("returns all files when exclude is omitted (default)", async () => {
		const files = await discoverFilesInDir(path.join(FIXTURES_DIR, "passing"), PKG_ROOT);
		expect(files.length).toBeGreaterThanOrEqual(2);
	});

	it("returns paths relative to cwd", async () => {
		const files = await discoverFilesInDir(path.join(FIXTURES_DIR, "passing"), PKG_ROOT);
		expect(files.every((f) => !path.isAbsolute(f))).toBe(true);
		expect(files.every((f) => f.startsWith("tests/fixtures/passing/"))).toBe(true);
	});

	it("skips node_modules directories", async () => {
		const files = await discoverFilesInDir(PKG_ROOT, PKG_ROOT);
		expect(files.some((f) => f.includes("node_modules"))).toBe(false);
	});

	it("skips hidden directories (starting with .)", async () => {
		const files = await discoverFilesInDir(PKG_ROOT, PKG_ROOT);
		expect(files.some((f) => f.includes("/.") || f.startsWith("."))).toBe(false);
	});

	it("accepts a custom pattern", async () => {
		const files = await discoverFilesInDir(FIXTURES_DIR, PKG_ROOT, /\.json$/i);
		expect(files.every((f) => f.endsWith(".json"))).toBe(true);
		expect(files.length).toBeGreaterThanOrEqual(1); // test-list.json
	});

	it("returns empty array for a non-existent directory", async () => {
		const files = await discoverFilesInDir("/nonexistent-path-xyz", PKG_ROOT);
		expect(files).toEqual([]);
	});
});

// ─── discoverVitestFiles — testListFile ───────────────────────────────────────

describe("discoverVitestFiles — testListFile", () => {
	it("loads files from a JSON array file", async () => {
		const files = await discoverVitestFiles({
			cwd: PKG_ROOT,
			testListFile: "tests/fixtures/test-list.json"
		});
		expect(files).toContain("tests/fixtures/passing/a.test.vitest.mjs");
		expect(files).toContain("tests/fixtures/passing/b.test.vitest.mjs");
	});

	it("throws a descriptive error when the file does not exist", async () => {
		await expect(discoverVitestFiles({ cwd: PKG_ROOT, testListFile: "nonexistent.json" })).rejects.toThrow(/Failed to read test list file/);
	});

	it("throws when the JSON is not an array", async () => {
		const tmpFile = path.join(TMP_ROOT, "not-array.json");
		await fs.mkdir(TMP_ROOT, { recursive: true });
		await fs.writeFile(tmpFile, JSON.stringify({ files: [] }));
		await expect(discoverVitestFiles({ cwd: PKG_ROOT, testListFile: tmpFile })).rejects.toThrow(/must contain a JSON array/);
	});

	it("applies earlyRunPatterns when using testListFile", async () => {
		const files = await discoverVitestFiles({
			cwd: PKG_ROOT,
			testListFile: "tests/fixtures/test-list.json",
			earlyRunPatterns: ["b.test"]
		});
		expect(files[0]).toContain("b.test");
	});
});

// ─── discoverVitestFiles — testPatterns ─────────────────────────────────────

describe("discoverVitestFiles — testPatterns", () => {
	it("returns all files when no patterns given (scanning testDir)", async () => {
		const files = await discoverVitestFiles({
			cwd: PKG_ROOT,
			testDir: path.join(FIXTURES_DIR, "passing")
		});
		expect(files.length).toBeGreaterThanOrEqual(2);
	});

	it("resolves a relative testDir against cwd", async () => {
		// Exercises the path.resolve(cwd, testDir) branch when testDir is relative
		const files = await discoverVitestFiles({
			cwd: PKG_ROOT,
			testDir: "tests/fixtures/passing"
		});
		expect(files.length).toBeGreaterThanOrEqual(2);
	});

	it("filters by exact relative file path", async () => {
		const files = await discoverVitestFiles({
			cwd: PKG_ROOT,
			testDir: FIXTURES_DIR,
			testPatterns: ["tests/fixtures/passing/a.test.vitest.mjs"]
		});
		expect(files).toEqual(["tests/fixtures/passing/a.test.vitest.mjs"]);
	});

	it("expands a directory pattern to all matching files inside", async () => {
		const files = await discoverVitestFiles({
			cwd: PKG_ROOT,
			testDir: FIXTURES_DIR,
			testPatterns: [path.join(FIXTURES_DIR, "passing")]
		});
		expect(files.length).toBeGreaterThanOrEqual(2);
	});

	it("falls back to partial-path matching for unresolved patterns", async () => {
		const files = await discoverVitestFiles({
			cwd: PKG_ROOT,
			testDir: FIXTURES_DIR,
			testPatterns: ["passing/a"]
		});
		expect(files.some((f) => f.includes("a.test.vitest.mjs"))).toBe(true);
	});

	it("deduplicates files when multiple patterns match the same file", async () => {
		const files = await discoverVitestFiles({
			cwd: PKG_ROOT,
			testDir: FIXTURES_DIR,
			testPatterns: ["passing/a", "passing/a"]
		});
		const count = files.filter((f) => f.includes("a.test.vitest.mjs")).length;
		expect(count).toBe(1);
	});

	it("warns and skips patterns with no matches (no throw)", async () => {
		const files = await discoverVitestFiles({
			cwd: PKG_ROOT,
			testDir: FIXTURES_DIR,
			testPatterns: ["this-does-not-exist-xyz"]
		});
		expect(files).toEqual([]);
	});

	it("does not include a non-matching file even when path exists", async () => {
		// package.json exists but doesn't match the default pattern
		const files = await discoverVitestFiles({
			cwd: PKG_ROOT,
			testDir: PKG_ROOT,
			testPatterns: ["package.json"]
		});
		expect(files).toEqual([]);
	});

	it("respects a custom testFilePattern", async () => {
		const files = await discoverVitestFiles({
			cwd: PKG_ROOT,
			testDir: FIXTURES_DIR,
			testFilePattern: /\.json$/i
		});
		expect(files.every((f) => f.endsWith(".json"))).toBe(true);
	});
});

// ─── discoverVitestFiles — exclude ───────────────────────────────────────────

describe("discoverVitestFiles — exclude", () => {
	it("applies exclude to the default scan (no testPatterns)", async () => {
		const files = await discoverVitestFiles({
			cwd: PKG_ROOT,
			testDir: FIXTURES_DIR,
			exclude: ["tests/fixtures/passing/**"]
		});
		expect(files.some((f) => f.includes("fixtures/passing/"))).toBe(false);
		expect(files.some((f) => f.includes("fixtures/failing/"))).toBe(true);
	});

	it("applies exclude to partial-path pattern resolution", async () => {
		const files = await discoverVitestFiles({
			cwd: PKG_ROOT,
			testDir: FIXTURES_DIR,
			testPatterns: ["a.test.vitest.mjs"],
			exclude: ["tests/fixtures/passing/**"]
		});
		expect(files).toEqual([]);
	});

	it("applies exclude when a testPattern resolves to a directory", async () => {
		const files = await discoverVitestFiles({
			cwd: PKG_ROOT,
			testDir: FIXTURES_DIR,
			testPatterns: [path.join(FIXTURES_DIR, "basename-collision")],
			exclude: ["tests/fixtures/basename-collision/packages/**"]
		});
		expect(files.some((f) => f.includes("basename-collision/packages/"))).toBe(false);
		expect(files.some((f) => f.includes("basename-collision/tests/"))).toBe(true);
	});

	it("defaults to no exclusions when omitted", async () => {
		const files = await discoverVitestFiles({
			cwd: PKG_ROOT,
			testDir: path.join(FIXTURES_DIR, "passing")
		});
		expect(files.length).toBeGreaterThanOrEqual(2);
	});
});
