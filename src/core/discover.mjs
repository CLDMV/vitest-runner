/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /src/core/discover.mjs
 *	@Date: 2026-02-24T22:33:55-08:00 (1772001235)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-10-02T15:35:19-07:00 (1790980519)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * @fileoverview Test-file discovery utilities.
 * @module vitest-runner/src/core/discover
 */

import fs from "node:fs/promises";
import path from "node:path";

/** Default pattern matching all supported Vitest test file extensions. */
export const DEFAULT_TEST_FILE_PATTERN = /\.test\.vitest\.(?:js|mjs|cjs)$/i;

/**
 * Compile a reduced glob pattern (`*`, `**`, `?`) into an anchored RegExp.
 * No brace expansion, character classes, or extglob syntax — just enough to
 * express directory/file excludes like `tmp/**` or `**\/*.snap`.
 *
 * @param {string} pattern - Glob pattern, matched against forward-slash-normalised paths.
 * @returns {RegExp}
 */
function globToRegExp(pattern) {
	const normalized = pattern.replace(/\\/g, "/");
	let out = "";
	for (let i = 0; i < normalized.length; i++) {
		const c = normalized[i];
		if (c === "*" && normalized[i + 1] === "*") {
			out += ".*";
			i++;
		} else if (c === "*") {
			out += "[^/]*";
		} else if (c === "?") {
			out += "[^/]";
		} else {
			out += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
		}
	}
	return new RegExp(`^${out}$`);
}

/**
 * Test whether a cwd-relative path matches any of the given exclude globs.
 * Callers checking a directory should also test the path with a trailing
 * slash appended, so a pattern like `tmp/**` prunes the `tmp` directory
 * itself rather than only the files found inside it.
 *
 * @param {string} relPath - Path relative to `cwd`, forward-slash-normalised.
 * @param {string[]} excludePatterns - Glob patterns relative to `cwd`.
 * @returns {boolean}
 * @example
 * isExcluded("tmp/worktree/a.test.vitest.mjs", ["tmp/**"]); // true
 * isExcluded("tmp/", ["tmp/**"]); // true — prunes the directory itself
 */
export function isExcluded(relPath, excludePatterns) {
	if (!excludePatterns || excludePatterns.length === 0) return false;
	return excludePatterns.some((pattern) => globToRegExp(pattern).test(relPath));
}

/**
 * Recursively discover all Vitest test files under a directory.
 * Skips `node_modules` and hidden directories (names starting with `.`),
 * plus any directory or file matching an `exclude` glob.
 *
 * @param {string} dir - Absolute path of the directory to scan.
 * @param {string} cwd - Project root used to compute relative paths.
 * @param {RegExp} [pattern=DEFAULT_TEST_FILE_PATTERN] - Regex tested against the file name.
 * @param {string[]} [exclude=[]] - Directory / file globs, relative to `cwd`, that discovery never enters.
 * @returns {Promise<string[]>} Paths relative to `cwd`.
 * @example
 * const files = await discoverFilesInDir('/project/src/tests', '/project');
 * @example
 * // Skip scratch worktrees carrying their own copy of the suite
 * const files = await discoverFilesInDir('/project', '/project', DEFAULT_TEST_FILE_PATTERN, ['tmp/**']);
 */
export async function discoverFilesInDir(dir, cwd, pattern = DEFAULT_TEST_FILE_PATTERN, exclude = []) {
	const queue = [dir];
	const files = [];

	while (queue.length) {
		const current = queue.pop();
		let entries;
		try {
			entries = await fs.readdir(current, { withFileTypes: true });
		} catch {
			continue;
		}

		for (const entry of entries) {
			const relPath = path.relative(cwd, path.join(current, entry.name)).replace(/\\/g, "/");

			if (entry.isDirectory()) {
				if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
				if (isExcluded(relPath, exclude) || isExcluded(`${relPath}/`, exclude)) continue;
				queue.push(path.join(current, entry.name));
				continue;
			}

			if (entry.isFile() && pattern.test(entry.name)) {
				if (isExcluded(relPath, exclude)) continue;
				files.push(path.relative(cwd, path.join(current, entry.name)));
			}
		}
	}

	return files;
}

/**
 * Sort test files alphabetically while hoisting files matching `earlyRunPatterns`
 * to the front (in pattern-declaration order, then alphabetically within each group).
 *
 * @param {string[]} files - File paths to sort.
 * @param {string[]} [earlyRunPatterns=[]] - Substrings — files whose path contains one run first.
 * @returns {string[]} Sorted file paths.
 * @example
 * sortWithPriority(files, ['listener-cleanup/']);
 */
export function sortWithPriority(files, earlyRunPatterns = []) {
	const early = [];
	const rest = [];

	for (const file of files) {
		const normalized = file.replace(/\\/g, "/");
		const priorityIndex = earlyRunPatterns.findIndex((pat) => normalized.includes(pat));
		if (priorityIndex !== -1) {
			early.push({ file, priorityIndex });
		} else {
			rest.push(file);
		}
	}

	early.sort((a, b) => a.priorityIndex - b.priorityIndex || a.file.localeCompare(b.file));
	rest.sort((a, b) => a.localeCompare(b));

	return [...early.map((e) => e.file), ...rest];
}

/**
 * Compute, for every file in `files`, the set of *other* files that Vitest's
 * own CLI filter would spuriously also match when that file's path is passed
 * as the filter argument.
 *
 * Vitest's `vitest run <filter>` matches any discovered test file whose path
 * *contains* `<filter>` as a substring — not just an exact-path match. Two
 * files that share the same basename (and immediate parent directory) at
 * different depths — e.g. `tests/contract.test.vitest.mjs` and
 * `packages/a/tests/contract.test.vitest.mjs` — collide because the shorter
 * path is a trailing substring of the longer one, so filtering on the shorter
 * path's exact string also matches the longer path's file. Passing an
 * absolute path does not help: Vitest normalises to a root-relative path
 * before matching.
 *
 * @param {string[]} files - File paths relative to the project root, as returned by discovery.
 * @returns {Map<string, string[]>} Map from each file to the other files it would spuriously match (empty array when unambiguous).
 * @example
 * const conflicts = computeFilterConflicts(["tests/a.mjs", "pkg/tests/a.mjs"]);
 * conflicts.get("tests/a.mjs"); // ["pkg/tests/a.mjs"]
 * conflicts.get("pkg/tests/a.mjs"); // []
 */
export function computeFilterConflicts(files) {
	const normalized = files.map((f) => f.replace(/\\/g, "/"));
	const conflicts = new Map();

	for (let i = 0; i < files.length; i++) {
		const matches = [];
		for (let j = 0; j < files.length; j++) {
			if (i === j) continue;
			if (normalized[j].includes(normalized[i])) matches.push(files[j]);
		}
		conflicts.set(files[i], matches);
	}

	return conflicts;
}

/**
 * @typedef {Object} DiscoverOptions
 * @property {string} cwd - Project root directory.
 * @property {string} [testDir] - Root directory to search for test files (defaults to `cwd`).
 * @property {string[]} [testPatterns=[]] - File / folder patterns to filter (empty = all files).
 * @property {string} [testListFile] - Path to a JSON array of test file paths to run instead of scanning.
 * @property {RegExp} [testFilePattern] - Regex to match file names (default: `DEFAULT_TEST_FILE_PATTERN`).
 * @property {string[]} [earlyRunPatterns=[]] - Path substrings for files that must run solo first.
 * @property {string[]} [exclude=[]] - Directory / file globs, relative to `cwd`, that discovery never enters. Applies to both the default scan and partial-path pattern resolution.
 */

/**
 * Discover Vitest test files according to the provided options.
 *
 * | Scenario | Behaviour |
 * |---|---|
 * | `testListFile` set | Reads the exact file list from that JSON file. |
 * | Patterns provided | Resolves each as file / directory, falls back to partial-path match. |
 * | No patterns | Returns all test files found under `testDir`. |
 *
 * @param {DiscoverOptions} opts
 * @returns {Promise<string[]>} Sorted array of test file paths relative to `cwd`.
 * @example
 * const files = await discoverVitestFiles({ cwd: '/project', testDir: '/project/src/tests' });
 */
export async function discoverVitestFiles(opts) {
	const {
		cwd,
		testDir,
		testPatterns = [],
		testListFile,
		testFilePattern = DEFAULT_TEST_FILE_PATTERN,
		earlyRunPatterns = [],
		exclude = []
	} = opts;

	const resolvedTestDir = testDir ? (path.isAbsolute(testDir) ? testDir : path.resolve(cwd, testDir)) : cwd;

	if (testListFile) {
		const resolvedListPath = path.isAbsolute(testListFile) ? testListFile : path.resolve(cwd, testListFile);

		let testList;
		try {
			const content = await fs.readFile(resolvedListPath, "utf8");
			testList = JSON.parse(content);
		} catch (err) {
			throw new Error(`Failed to read test list file "${resolvedListPath}": ${err.message}`, { cause: err });
		}

		if (!Array.isArray(testList)) {
			throw new Error(`Test list file "${resolvedListPath}" must contain a JSON array of test file paths`);
		}

		console.log(`📋 Loading test list from: ${path.relative(cwd, resolvedListPath)}`);
		return sortWithPriority(testList, earlyRunPatterns);
	}

	if (testPatterns.length === 0) {
		const files = await discoverFilesInDir(resolvedTestDir, cwd, testFilePattern, exclude);
		return sortWithPriority(files, earlyRunPatterns);
	}

	const files = [];

	for (const pattern of testPatterns) {
		const absPath = path.isAbsolute(pattern) ? pattern : path.resolve(cwd, pattern);

		let stat = null;
		try {
			stat = await fs.stat(absPath);
		} catch {
			// path doesn't exist — fall through to partial-match
		}

		if (stat?.isFile()) {
			if (testFilePattern.test(absPath)) {
				files.push(path.relative(cwd, absPath));
			}
		} else if (stat?.isDirectory()) {
			files.push(...(await discoverFilesInDir(absPath, cwd, testFilePattern, exclude)));
		} else {
			// Partial-path matching against all files in testDir
			const allFiles = await discoverFilesInDir(resolvedTestDir, cwd, testFilePattern, exclude);
			const matched = allFiles.filter((f) => f.replace(/\\/g, "/").includes(pattern.replace(/\\/g, "/")));

			if (matched.length > 0) {
				files.push(...matched);
			} else {
				console.warn(`⚠️  No matches found for: ${pattern}`);
			}
		}
	}

	return sortWithPriority([...new Set(files)], earlyRunPatterns);
}
