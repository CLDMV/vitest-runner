/**
 * @typedef {Object} ParsedVitestResult
 * @property {number} testFilesPass - Number of test files that passed.
 * @property {number} testFilesFail - Number of test files that failed.
 * @property {number} testsPass - Number of individual tests that passed.
 * @property {number} testsFail - Number of individual tests that failed.
 * @property {number} testsSkip - Number of individual tests that were skipped.
 * @property {number} duration - Duration in milliseconds (from Vitest output).
 * @property {number|null} heapMb - Peak heap usage in MB, or `null` if not reported.
 * @property {string[]} errors - Array of raw error blocks (with ANSI codes).
 */
/**
 * Parse raw Vitest stdout/stderr output into structured result data.
 *
 * Extracts test-file counts, individual test counts, duration, heap usage,
 * and error blocks.  Counts are parsed from ANSI-stripped output; error blocks
 * are captured from the original coloured output.
 *
 * @param {string} output - Combined raw stdout + stderr from a vitest child process.
 * @returns {ParsedVitestResult}
 * @example
 * const result = parseVitestOutput(rawOutput);
 * console.log(result.testsPass, result.testsFail);
 */
export function parseVitestOutput(output: string): ParsedVitestResult;
/**
 * Deduplicate similar FAIL lines that differ only by their `Config:` value.
 *
 * When the same test file fails across multiple matrix configs vitest emits
 * one FAIL line per config.  This collapses them into a single line listing
 * all configs as an array, keeping output concise.
 *
 * @param {string[]} errors - Array of raw error blocks (each a complete FAIL section).
 * @returns {string} Deduplicated error text joined as a single string.
 * @example
 * const deduped = deduplicateErrors(result.errors);
 * console.log(deduped);
 */
export function deduplicateErrors(errors: string[]): string;
export type ParsedVitestResult = {
    /**
     * - Number of test files that passed.
     */
    testFilesPass: number;
    /**
     * - Number of test files that failed.
     */
    testFilesFail: number;
    /**
     * - Number of individual tests that passed.
     */
    testsPass: number;
    /**
     * - Number of individual tests that failed.
     */
    testsFail: number;
    /**
     * - Number of individual tests that were skipped.
     */
    testsSkip: number;
    /**
     * - Duration in milliseconds (from Vitest output).
     */
    duration: number;
    /**
     * - Peak heap usage in MB, or `null` if not reported.
     */
    heapMb: number | null;
    /**
     * - Array of raw error blocks (with ANSI codes).
     */
    errors: string[];
};
