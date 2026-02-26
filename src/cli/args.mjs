/**
 * @fileoverview CLI argument parsing for the vitest-runner binary.
 * @module vitest-runner/src/cli/args
 */

/**
 * @typedef {Object} ParsedArgs
 * @property {string|undefined} testListFile - Path to a JSON file of test paths to run (`--test-list`).
 * @property {boolean} showErrorDetails - `false` when `--no-error-details` was passed.
 * @property {boolean} coverageQuiet - Whether `--coverage-quiet` was passed.
 * @property {string|undefined} logFile - Path for the coverage run log (`--log-file`); defaults to `coverage/coverage-run.log`.
 * @property {boolean} help - Whether `--help` / `-h` was passed.
 * @property {number|undefined} workers - Worker count from `--workers <n>`, or undefined.
 * @property {string[]} soloPatterns - Path substrings from `--solo-pattern <pattern>` (repeatable).
 * @property {RegExp|undefined} testFilePattern - Compiled regex from `--file-pattern <regex>`, or undefined.
 * @property {string[]} vitestPassthroughArgs - Flags forwarded verbatim to vitest.
 * @property {string[]} testPatterns - Non-flag positional arguments (file / folder patterns).
 */

/** Runner-owned flags that must not be forwarded to vitest. */
const RUNNER_FLAGS = new Set([
	"--test-list",
	"--no-error-details",
	"--coverage-quiet",
	"--log-file",
	"--workers",
	"--solo-pattern",
	"--file-pattern",
	"--help",
	"-h"
]);

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
export function parseArguments(args) {
	const vitestPassthroughArgs = [];
	const testPatterns = [];
	const soloPatterns = [];
	let testListFile;
	let showErrorDetails = true;
	let coverageQuiet = false;
	let logFile;
	let workers;
	let help = false;
	let testFilePattern;
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		if (arg === "--test-list") {
			testListFile = args[++i];
		} else if (arg.startsWith("--test-list=")) {
			testListFile = arg.slice("--test-list=".length);
		} else if (arg === "--no-error-details") {
			showErrorDetails = false;
		} else if (arg === "--coverage-quiet") {
			coverageQuiet = true;
		} else if (arg === "--log-file") {
			logFile = args[++i];
		} else if (arg.startsWith("--log-file=")) {
			logFile = arg.slice("--log-file=".length);
		} else if (arg === "--workers") {
			workers = parseInt(args[++i], 10);
		} else if (arg.startsWith("--workers=")) {
			workers = parseInt(arg.slice("--workers=".length), 10);
		} else if (arg === "--solo-pattern") {
			soloPatterns.push(args[++i]);
		} else if (arg.startsWith("--solo-pattern=")) {
			soloPatterns.push(arg.slice("--solo-pattern=".length));
		} else if (arg === "--file-pattern") {
			testFilePattern = new RegExp(args[++i], "i");
		} else if (arg.startsWith("--file-pattern=")) {
			testFilePattern = new RegExp(arg.slice("--file-pattern=".length), "i");
		} else if (arg === "--help" || arg === "-h") {
			help = true;
		} else if ((arg.startsWith("--") || arg.startsWith("-")) && !RUNNER_FLAGS.has(arg)) {
			vitestPassthroughArgs.push(arg);
			// Consume the next token if it looks like a value (not another flag)
			if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
				vitestPassthroughArgs.push(args[++i]);
			}
		} else {
			// Any remaining token (cannot start with '-'; those are caught above)
			testPatterns.push(arg);
		}
	}

	return {
		testListFile,
		showErrorDetails,
		coverageQuiet,
		logFile,
		help,
		workers,
		soloPatterns,
		testFilePattern,
		vitestPassthroughArgs,
		testPatterns
	};
}
