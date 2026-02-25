/**
 * Run all discovered Vitest test files sequentially (with a configurable worker
 * pool for the non-solo phase) and return an exit code.
 *
 * @param {RunOptions} opts
 * @returns {Promise<number>} `0` on full pass, `1` on any failure.
 */
export function run(opts: RunOptions): Promise<number>;
export { formatDuration } from "./utils/duration.mjs";
export { buildNodeOptions } from "./utils/env.mjs";
export type PerFileHeapOverride = {
    /**
     * - Substring matched against the normalised file path.
     */
    pattern: string;
    /**
     * - Minimum heap ceiling in MB for matching files.
     */
    heapMb: number;
};
export type RunOptions = {
    /**
     * - Absolute project root directory.
     */
    cwd: string;
    /**
     * - Directory to scan for test files (relative or absolute; defaults to `cwd`).
     */
    testDir?: string;
    /**
     * - Explicit vitest config path; auto-detected from `cwd` when omitted.
     */
    vitestConfig?: string;
    /**
     * - File / folder patterns to filter (empty = all files in `testDir`).
     */
    testPatterns?: string[];
    /**
     * - Path to a JSON array of test file paths; when set, scanning is skipped.
     */
    testListFile?: string;
    /**
     * - Regex matched against file names when scanning (default: `*.test.vitest.{js,mjs,cjs}`).
     */
    testFilePattern?: RegExp;
    /**
     * - Extra CLI args forwarded verbatim to every vitest invocation.
     */
    vitestArgs?: string[];
    /**
     * - Print inline error blocks under each failed file.
     */
    showErrorDetails?: boolean;
    /**
     * - Suppress per-file output; show only progress bar + summaries.
     */
    coverageQuiet?: boolean;
    /**
     * - Maximum number of parallel worker slots.
     */
    workers?: number;
    /**
     * - Rows in the worst-coverage table (0 = disable).
     */
    worstCoverageCount?: number;
    /**
     * - Global `--max-old-space-size` ceiling; per-file overrides may raise it.
     */
    maxOldSpaceMb?: number;
    /**
     * - Path substrings — matching files run solo before the worker pool.
     */
    earlyRunPatterns?: string[];
    /**
     * - Per-file minimum heap overrides.
     */
    perFileHeapOverrides?: PerFileHeapOverride[];
    /**
     * - Additional `--conditions` Node flags forwarded to children.
     */
    conditions?: string[];
    /**
     * - Value for `NODE_ENV` in child processes.
     */
    nodeEnv?: string;
    /**
     * -
     */
    _testResultsOverride?: object[] | null;
};
export { resolveBin, resolveVitestConfig } from "./utils/resolve.mjs";
export { discoverVitestFiles, sortWithPriority, discoverFilesInDir } from "./core/discover.mjs";
export { parseVitestOutput, deduplicateErrors } from "./core/parse.mjs";
export { runSingleFile, runVitestDirect, runMergeReports } from "./core/spawn.mjs";
export { createCoverageProgressTracker, noopProgressTracker } from "./core/progress.mjs";
export { printCoverageSummary, printMergeOutput, printQuietCoverageFailureDetails } from "./core/report.mjs";
export { stripAnsi, colourPct } from "./utils/ansi.mjs";
