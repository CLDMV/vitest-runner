/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /src/cli/help.mjs
 *	@Date: 2026-02-24T22:33:55-08:00 (1772001235)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-22T21:43:34-08:00 (1795412614)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

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
  --file-pattern <regex>  Override the file discovery regex (default: \\.test\\.vitest\\.(?:js|mjs|cjs)$)
  --workers <n>           Number of parallel workers (default: 4 or VITEST_WORKERS)
  --solo-pattern <pat>    Run files matching this path substring solo first (repeatable)
  --exclude <glob>        Directory / file glob discovery never enters, relative to cwd (repeatable)
  --no-error-details      Hide detailed error output (show only counts)
  --coverage-quiet        Implies --coverage; show progress bar + final summaries only
  --log-file <path>       Path for mirrored runner output (default: coverage/coverage-run.log with --coverage-quiet)
  --suppress-file-output  Suppress per-file runner output blocks
  --suppress-passing-files  Hide the PASSED TEST FILES section in the final summary
  --no-top-summary        Hide TOP MEMORY USERS and TOP DURATION sections
  --json                  Emit JSON summary output instead of text logs
  --blobs-dir <path>      Directory for per-file coverage blobs (default: .vitest-coverage-blobs)
  --no-merge-reports      Leave coverage blobs in --blobs-dir without merging (for an external merge)
  --merge-batch-size <n>  Merge coverage blobs in batches of n when there are more than n,
                         keeping the merge's memory bounded (default: 50; 0 = one merge)
  --file-timeout <s>      Kill a test file's processes and fail it after s seconds
                         (default: 1800 or VITEST_FILE_TIMEOUT; 0 = no limit)
  --file-idle-timeout <s> Kill and fail a file that prints nothing for s seconds
                         (default: 600 or VITEST_FILE_IDLE_TIMEOUT; 0 = no limit)
  --keep-tmp              Keep this run's scratch directory instead of removing it on completion
  --scratch-dir <path>    Per-run scratch root, relative to cwd (default: tmp/vitest-runner)
  --isolate               Run the suite in its own PID namespace (Linux; also CLDMV_TEST_ISOLATE=1)
  --isolate=force         Isolate even when already in a PID namespace (also CLDMV_TEST_ISOLATE=force)
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
  VITEST_MERGE_BATCH_SIZE  Coverage merge batch size (default: 50, overridden by --merge-batch-size)
  VITEST_FILE_TIMEOUT    Per-file time limit in seconds (default: 1800, overridden by --file-timeout)
  VITEST_FILE_IDLE_TIMEOUT  Per-file idle limit in seconds (default: 600, overridden by --file-idle-timeout)
  VITEST_RUNNER_TMP      Set by the runner in each child — this run's per-file scratch
                         directory. Use makeRunTmpDir(label) from a test file instead
                         of reading it directly when you want a fresh subdirectory.
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

  # Skip scratch worktrees when discovery walks the repo root
  vitest-runner --exclude 'tmp/**' --exclude 'dist/**'

  # Hide detailed errors
  vitest-runner --no-error-details

  # Coverage with quiet output + progress bar
  vitest-runner --coverage --coverage-quiet

  # Custom heap and workers
  VITEST_HEAP_MB=8192 vitest-runner --workers 2 src/tests/heavy
`);
}
