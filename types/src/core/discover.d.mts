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
export function isExcluded(relPath: string, excludePatterns: string[]): boolean;
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
export function discoverFilesInDir(dir: string, cwd: string, pattern?: RegExp, exclude?: string[]): Promise<string[]>;
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
export function sortWithPriority(files: string[], earlyRunPatterns?: string[]): string[];
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
export function computeFilterConflicts(files: string[]): Map<string, string[]>;
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
export function discoverVitestFiles(opts: DiscoverOptions): Promise<string[]>;
/** Default pattern matching all supported Vitest test file extensions. */
export const DEFAULT_TEST_FILE_PATTERN: RegExp;
export type DiscoverOptions = {
    /**
     * - Project root directory.
     */
    cwd: string;
    /**
     * - Root directory to search for test files (defaults to `cwd`).
     */
    testDir?: string;
    /**
     * - File / folder patterns to filter (empty = all files).
     */
    testPatterns?: string[];
    /**
     * - Path to a JSON array of test file paths to run instead of scanning.
     */
    testListFile?: string;
    /**
     * - Regex to match file names (default: `DEFAULT_TEST_FILE_PATTERN`).
     */
    testFilePattern?: RegExp;
    /**
     * - Path substrings for files that must run solo first.
     */
    earlyRunPatterns?: string[];
    /**
     * - Directory / file globs, relative to `cwd`, that discovery never enters. Applies to both the default scan and partial-path pattern resolution.
     */
    exclude?: string[];
};
