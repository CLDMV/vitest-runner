/**
 * @fileoverview Test-file discovery utilities.
 * @module vitest-runner/src/core/discover
 */

import fs from "node:fs/promises";
import path from "node:path";

/** Default pattern matching all supported Vitest test file extensions. */
export const DEFAULT_TEST_FILE_PATTERN = /\.test\.vitest\.(?:js|mjs|cjs)$/i;

/**
 * Recursively discover all Vitest test files under a directory.
 * Skips `node_modules` and hidden directories (names starting with `.`).
 *
 * @param {string} dir - Absolute path of the directory to scan.
 * @param {string} cwd - Project root used to compute relative paths.
 * @param {RegExp} [pattern=DEFAULT_TEST_FILE_PATTERN] - Regex tested against the file name.
 * @returns {Promise<string[]>} Paths relative to `cwd`.
 * @example
 * const files = await discoverFilesInDir('/project/src/tests', '/project');
 */
export async function discoverFilesInDir(dir, cwd, pattern = DEFAULT_TEST_FILE_PATTERN) {
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
			if (entry.isDirectory()) {
				if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
				queue.push(path.join(current, entry.name));
				continue;
			}

			if (entry.isFile() && pattern.test(entry.name)) {
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
 * @typedef {Object} DiscoverOptions
 * @property {string} cwd - Project root directory.
 * @property {string} [testDir] - Root directory to search for test files (defaults to `cwd`).
 * @property {string[]} [testPatterns=[]] - File / folder patterns to filter (empty = all files).
 * @property {string} [testListFile] - Path to a JSON array of test file paths to run instead of scanning.
 * @property {RegExp} [testFilePattern] - Regex to match file names (default: `DEFAULT_TEST_FILE_PATTERN`).
 * @property {string[]} [earlyRunPatterns=[]] - Path substrings for files that must run solo first.
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
	const { cwd, testDir, testPatterns = [], testListFile, testFilePattern = DEFAULT_TEST_FILE_PATTERN, earlyRunPatterns = [] } = opts;

	const resolvedTestDir = testDir ? (path.isAbsolute(testDir) ? testDir : path.resolve(cwd, testDir)) : cwd;

	if (testListFile) {
		const resolvedListPath = path.isAbsolute(testListFile) ? testListFile : path.resolve(cwd, testListFile);

		let testList;
		try {
			const content = await fs.readFile(resolvedListPath, "utf8");
			testList = JSON.parse(content);
		} catch (err) {
			throw new Error(`Failed to read test list file "${resolvedListPath}": ${err.message}`);
		}

		if (!Array.isArray(testList)) {
			throw new Error(`Test list file "${resolvedListPath}" must contain a JSON array of test file paths`);
		}

		console.log(`📋 Loading test list from: ${path.relative(cwd, resolvedListPath)}`);
		return sortWithPriority(testList, earlyRunPatterns);
	}

	if (testPatterns.length === 0) {
		const files = await discoverFilesInDir(resolvedTestDir, cwd, testFilePattern);
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
			files.push(...(await discoverFilesInDir(absPath, cwd, testFilePattern)));
		} else {
			// Partial-path matching against all files in testDir
			const allFiles = await discoverFilesInDir(resolvedTestDir, cwd, testFilePattern);
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
