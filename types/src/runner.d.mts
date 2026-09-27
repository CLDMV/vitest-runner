/**
 * Run all discovered Vitest test files sequentially (with a configurable worker
 * pool for the non-solo phase) and return an exit code.
 *
 * Owns the run's scratch directory lifecycle (`scratchDir`/`keepTmp`): sweeps stale
 * roots from dead prior runs, creates this run's root, and removes it on every exit
 * path — normal completion, a thrown error, or SIGINT/SIGTERM — unless `keepTmp` is
 * set. The actual run logic lives in {@link runImpl}; this wrapper only exists to
 * guarantee that cleanup regardless of how `runImpl` returns or throws.
 *
 * @param {RunOptions} opts
 * @returns {Promise<number|object>} `0`/`1` by default; JSON report object when `opts.json` is true.
 */
export function run(opts: RunOptions): Promise<number | object>;
export { formatDuration } from "./utils/duration.mjs";
export { buildNodeOptions } from "./utils/env.mjs";
export { makeRunTmpDir } from "./core/scratch.mjs";
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
     * - Absolute project root directory (defaults to `process.cwd()`).
     */
    cwd?: string;
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
     * - Suppress per-file runner output blocks in all modes.
     */
    suppressFileOutput?: boolean;
    /**
     * - Hide passed-file rows in the final summary.
     */
    suppressPassingFiles?: boolean;
    /**
     * - Show top memory and duration summary sections.
     */
    topSummary?: boolean;
    /**
     * - Return a JSON run report instead of printing text output.
     */
    json?: boolean;
    /**
     * - Maximum number of parallel worker slots.
     */
    workers?: number;
    /**
     * - Rows in the worst-coverage table (0 = disable).
     */
    worstCoverageCount?: number;
    /**
     * - Directory for per-file coverage blobs (default `<cwd>/.vitest-coverage-blobs`). Relative paths resolve against `cwd`. Always cleared at the start of a coverage run.
     */
    blobsDir?: string;
    /**
     * - When `true`, blobs are merged via `vitest --mergeReports`, the coverage summary is printed, and `blobsDir` is deleted at the end. When `false`, the run stops after producing blobs: no merge, no summary, and `blobsDir` is left populated for an external merge step.
     */
    mergeReports?: boolean;
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
     * - Per-run scratch root, relative to `cwd` (or absolute). A subdirectory is created per file invocation and exposed to it via `VITEST_RUNNER_TMP`.
     */
    scratchDir?: string;
    /**
     * - Keep the run's scratch root instead of removing it on completion (normal exit, failure, or SIGINT/SIGTERM).
     */
    keepTmp?: boolean;
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
