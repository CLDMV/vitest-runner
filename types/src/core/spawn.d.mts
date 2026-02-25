/**
 * @typedef {Object} SingleFileResult
 * @property {string} file - Test file path.
 * @property {number} code - Process exit code.
 * @property {number} duration - Run duration in milliseconds.
 * @property {number} testFilesPass
 * @property {number} testFilesFail
 * @property {number} testsPass
 * @property {number} testsFail
 * @property {number} testsSkip
 * @property {number|null} heapMb
 * @property {string[]} errors
 * @property {string} rawOutput
 */
/**
 * Run a single Vitest test file in a child process and return parsed results.
 *
 * @param {string} filePath - Test file path (relative to `cwd` or absolute).
 * @param {SpawnBaseOptions & { vitestArgs?: string[], streamOutput?: boolean }} opts
 * @returns {Promise<SingleFileResult>}
 * @example
 * const result = await runSingleFile('src/tests/foo.test.vitest.mjs', {
 *   cwd: '/project',
 *   vitestBin: '/project/node_modules/.bin/vitest',
 *   vitestConfig: '/project/vitest.config.ts',
 * });
 */
export function runSingleFile(filePath: string, opts: SpawnBaseOptions & {
    vitestArgs?: string[];
    streamOutput?: boolean;
}): Promise<SingleFileResult>;
/**
 * Run Vitest directly (all files in one process) with inherited stdio.
 *
 * @param {SpawnBaseOptions & { vitestArgs?: string[] }} opts
 * @returns {Promise<number>} Process exit code.
 * @example
 * const code = await runVitestDirect({
 *   cwd: '/project',
 *   vitestBin: '/project/node_modules/.bin/vitest',
 *   vitestArgs: ['--reporter=verbose'],
 * });
 */
export function runVitestDirect(opts: SpawnBaseOptions & {
    vitestArgs?: string[];
}): Promise<number>;
/**
 * Merge blob reports from individual coverage runs into a single coverage report
 * using `vitest --mergeReports`.
 *
 * @param {string} blobsDir - Directory containing the `.blob` files to merge.
 * @param {SpawnBaseOptions & { extraCoverageArgs?: string[], quietOutput?: boolean }} opts
 * @returns {Promise<{ exitCode: number, output: string }>}
 * @example
 * const { exitCode } = await runMergeReports('/project/.vitest-blobs', {
 *   cwd: '/project',
 *   vitestBin: '/project/node_modules/.bin/vitest',
 * });
 */
export function runMergeReports(blobsDir: string, opts: SpawnBaseOptions & {
    extraCoverageArgs?: string[];
    quietOutput?: boolean;
}): Promise<{
    exitCode: number;
    output: string;
}>;
export type SpawnBaseOptions = {
    /**
     * - Working directory for the child process.
     */
    cwd: string;
    /**
     * - Absolute path to the vitest binary.
     */
    vitestBin: string;
    /**
     * - Vitest config path (omit to let vitest auto-detect).
     */
    vitestConfig: string | undefined;
    /**
     * - Optional `--max-old-space-size` ceiling.
     */
    maxOldSpaceMb: number | undefined;
    /**
     * - Additional `--conditions` flags.
     */
    conditions?: string[];
    /**
     * - Value for `NODE_ENV`.
     */
    nodeEnv?: string;
};
export type SingleFileResult = {
    /**
     * - Test file path.
     */
    file: string;
    /**
     * - Process exit code.
     */
    code: number;
    /**
     * - Run duration in milliseconds.
     */
    duration: number;
    testFilesPass: number;
    testFilesFail: number;
    testsPass: number;
    testsFail: number;
    testsSkip: number;
    heapMb: number | null;
    errors: string[];
    rawOutput: string;
};
