/**
 * @fileoverview CLI help text for the vitest-runner binary.
 * @module vitest-runner/src/cli/help
 */

import chalk from "chalk";

/**
 * Print the full CLI help message to stdout.
 * @returns {void}
 * @example
 * showHelp();
 */
export function showHelp() {
	console.log(`
${chalk.bold("Vitest Sequential Runner")}
Runs each test file in its own Vitest process to avoid OOM issues.

${chalk.bold("USAGE:")}
  vitest-runner [OPTIONS] [PATTERNS]

${chalk.bold("SPECIAL FLAGS:")}
  --test-list <file>      Run only the files listed in a JSON array file
  --file-pattern <regex>  Override the file discovery regex (default: \.test\.vitest\.(?:js|mjs|cjs)$)
  --workers <n>           Number of parallel workers (default: 4 or VITEST_WORKERS)
  --solo-pattern <pat>    Run files matching this path substring solo first (repeatable)
  --no-error-details      Hide detailed error output (show only counts)
  --coverage-quiet        Implies --coverage; show progress bar + final summaries only
  --log-file <path>       Path for the coverage run log (default: coverage/coverage-run.log; implies --coverage-quiet)
  --help, -h              Show this help message

${chalk.bold("TEST PATTERNS:")}
  [file]                  Run a specific test file (supports partial paths)
  [folder]                Run all tests in a folder

  Examples:
    src/tests/config/background.test.vitest.mjs
    src/tests/metadata
    background.test.vitest.mjs

${chalk.bold("VITEST FLAGS:")}
  All standard Vitest CLI flags are supported and passed through:
  -t, --testNamePattern   Filter tests by name pattern (regex)
  --reporter              Change reporter (verbose, dot, json, etc.)
  --coverage              Run full-suite coverage (blob-per-file + mergeReports)
  --bail                  Stop on first failure

  See the Vitest documentation for the full list.

${chalk.bold("ENVIRONMENT VARIABLES:")}
  VITEST_HEAP_MB         Set max heap size per test (default: Node.js default)
  VITEST_WORKERS         Number of parallel workers (default: 4, overridden by --workers)
  # Run all tests
  vitest-runner

  # Run a specific file (partial path ok)
  vitest-runner src/tests/config/background.test.vitest.mjs

  # Run only the files listed in a JSON file
  vitest-runner --test-list my-tests.json

  # Filter by test name
  vitest-runner src/tests/metadata -t "lazy materialization"

  # Run with 2 workers
  vitest-runner --workers 2

  # Run files matching a pattern solo first, then the rest in parallel
  vitest-runner --solo-pattern listener-cleanup/ --solo-pattern heavy/

  # Hide detailed errors
  vitest-runner --no-error-details

  # Coverage with quiet output + progress bar
  vitest-runner --coverage --coverage-quiet

  # Custom heap and workers
  VITEST_HEAP_MB=8192 vitest-runner --workers 2 src/tests/heavy
`);
}
