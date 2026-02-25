/**
 * Print verbose output for files that failed during a quiet coverage run.
 *
 * @param {Array<{file: string, code: number, rawOutput: string}>} failedResults
 * @returns {void}
 * @example
 * printQuietCoverageFailureDetails(failedResults);
 */
export function printQuietCoverageFailureDetails(failedResults: Array<{
    file: string;
    code: number;
    rawOutput: string;
}>): void;
/**
 * Print the captured output from a quiet `--mergeReports` step.
 *
 * On success prints only the coverage block (from "% Coverage report from v8").
 * On failure prints the full raw output to stderr.
 *
 * @param {number} exitCode - The merge process exit code.
 * @param {string} output - Raw stdout + stderr from the merge process.
 * @returns {void}
 */
export function printMergeOutput(exitCode: number, output: string): void;
/**
 * Compute a coverage-summary-style object from a raw V8/Istanbul `coverage-final.json`.
 *
 * @param {Record<string, object>} finalData - Parsed `coverage-final.json` contents.
 * @returns {{ total: object, [filePath: string]: object }} Istanbul coverage-summary format.
 */
export function computeSummaryFromFinal(finalData: Record<string, object>): {
    total: object;
    [filePath: string]: object;
};
/**
 * Read the coverage JSON produced after a `mergeReports` run and print a
 * worst-offenders table plus overall-coverage totals.
 *
 * Tries `coverage-summary.json` first; falls back to computing from
 * `coverage-final.json` if that is not present.
 *
 * @param {string} cwd - Project root (used to make absolute file paths relative).
 * @param {string[]} extraCoverageArgs - Passthrough `--coverage.*` args (checked for `reportsDirectory`).
 * @param {number} [worstCount=10] - Number of worst-coverage files to show (0 = skip table).
 * @returns {Promise<void>}
 */
export function printCoverageSummary(cwd: string, extraCoverageArgs: string[], worstCount?: number): Promise<void>;
