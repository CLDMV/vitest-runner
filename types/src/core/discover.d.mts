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
export function discoverFilesInDir(dir: string, cwd: string, pattern?: RegExp): Promise<string[]>;
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
};
