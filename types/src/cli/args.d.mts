/**
 * Parse raw CLI arguments into structured runner options.
 *
 * Runner-specific flags are extracted; everything else (flags and their
 * optional values) is forwarded to vitest as passthrough args.
 * A flag that takes a value (where the next token does not start with `-`)
 * consumes that token too.
 *
 * @param {string[]} args - Raw argument array (typically `process.argv.slice(2)`).
 * @returns {ParsedArgs}
 * @example
 * parseArguments(['--test-list', 'tests.json', '--workers', '2', '--reporter=verbose']);
 */
export function parseArguments(args: string[]): ParsedArgs;
export type ParsedArgs = {
    /**
     * - Path to a JSON file of test paths to run (`--test-list`).
     */
    testListFile: string | undefined;
    /**
     * - `false` when `--no-error-details` was passed.
     */
    showErrorDetails: boolean;
    /**
     * - Whether `--coverage-quiet` was passed.
     */
    coverageQuiet: boolean;
    /**
     * - Path for the coverage run log (`--log-file`); defaults to `coverage/coverage-run.log`.
     */
    logFile: string | undefined;
    /**
     * - Whether `--help` / `-h` was passed.
     */
    help: boolean;
    /**
     * - Worker count from `--workers <n>`, or undefined.
     */
    workers: number | undefined;
    /**
     * - Path substrings from `--solo-pattern <pattern>` (repeatable).
     */
    soloPatterns: string[];
    /**
     * - Compiled regex from `--file-pattern <regex>`, or undefined.
     */
    testFilePattern: RegExp | undefined;
    /**
     * - Flags forwarded verbatim to vitest.
     */
    vitestPassthroughArgs: string[];
    /**
     * - Non-flag positional arguments (file / folder patterns).
     */
    testPatterns: string[];
};
