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
 * @property {string} [timedOut] - Why the watchdog killed the file, when it did.
 */
/**
 * Run a single Vitest test file in a child process and return parsed results.
 *
 * @param {string} filePath - Test file path (relative to `cwd` or absolute).
 * The child runs in its own process group (POSIX). With `timeoutMs` or `idleTimeoutMs` set,
 * a file that runs longer than `timeoutMs`, or prints nothing for `idleTimeoutMs`, has its
 * whole group killed (SIGTERM, then SIGKILL after `killGraceMs`) and is reported as failed
 * with the reason and its last output lines. `0` or unset means no limit.
 *
 * @param {SpawnBaseOptions & { vitestArgs?: string[], streamOutput?: boolean, excludePaths?: string[], extraEnv?: NodeJS.ProcessEnv, timeoutMs?: number, idleTimeoutMs?: number, killGraceMs?: number }} opts
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
    excludePaths?: string[];
    extraEnv?: NodeJS.ProcessEnv;
    timeoutMs?: number;
    idleTimeoutMs?: number;
    killGraceMs?: number;
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
 * When `blobsDir` holds more blobs than `batchSize`, the blobs are first reduced
 * in rounds (each batch merged into one blob in its own helper process, see
 * core/merge-batches.mjs) so the final `vitest --mergeReports` never has to hold
 * every coverage map at once. At or below `batchSize` nothing changes. The
 * reduction's files live under `scratchDir` and are removed on every exit path.
 * If the installed vitest or the blobs don't have the supported layout, the run
 * falls back to merging all blobs in one process and says so.
 *
 * @param {string} blobsDir - Directory containing the `.blob` files to merge.
 * @param {SpawnBaseOptions & { extraCoverageArgs?: string[], extraArgs?: string[], quietOutput?: boolean, batchSize?: number, scratchDir?: string }} opts
 *   `batchSize` defaults to `VITEST_MERGE_BATCH_SIZE` or 50 (`0` = never batch).
 *   `scratchDir` defaults to a directory next to `blobsDir`.
 * @returns {Promise<{ exitCode: number, output: string }>}
 * @example
 * const { exitCode } = await runMergeReports('/project/.vitest-blobs', {
 *   cwd: '/project',
 *   vitestBin: '/project/node_modules/.bin/vitest',
 * });
 */
export function runMergeReports(blobsDir: string, opts: SpawnBaseOptions & {
    extraCoverageArgs?: string[];
    extraArgs?: string[];
    quietOutput?: boolean;
    batchSize?: number;
    scratchDir?: string;
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
    /**
     * - Why the watchdog killed the file, when it did.
     */
    timedOut?: string;
};
