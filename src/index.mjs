/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /src/index.mjs
 *	@Date: 2026-02-24T22:33:55-08:00 (1772001235)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-25T18:53:20-08:00 (1795661600)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * @fileoverview Main sequential Vitest runner orchestration.
 * @module vitest-runner/src/runner
 *
 * @description
 * Runs each Vitest test file in its own child process to avoid OOM issues in
 * large test suites, collects results, and produces a Vitest-style summary.
 *
 * Supports coverage mode (blob-per-file + mergeReports) and a quiet progress-bar
 * variant so CI pipelines can keep output concise.  All standard Vitest CLI flags
 * are forwarded to child processes unchanged.
 *
 * @example
 * // Run every test file found under src/tests/ (cwd defaults to process.cwd())
 * import { run } from 'vitest-runner';
 * const code = await run({ testDir: 'src/tests' });
 * process.exit(code);
 *
 * @example
 * // Run a subset with custom heap limit
 * const code = await run({
 *   testDir: 'src/tests',
 *   testPatterns: ['src/tests/config'],
 *   maxOldSpaceMb: 4096,
 * });
 */

import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";

import { resolveBin, resolveVitestConfig } from "./utils/resolve.mjs";
import { discoverVitestFiles, computeFilterConflicts } from "./core/discover.mjs";
import { runSingleFile, runMergeReports } from "./core/spawn.mjs";
import { prepareFsModuleCache } from "./core/fs-cache.mjs";
import { deduplicateErrors } from "./core/parse.mjs";
import { createCoverageProgressTracker, noopProgressTracker } from "./core/progress.mjs";
import { printQuietCoverageFailureDetails, printMergeOutput, printCoverageSummary, resolveCoverageDir } from "./core/report.mjs";
import { writeCoverageIndex } from "./core/coverage-index.mjs";
import { findVitestPackage, loadBlobLibraries } from "./core/merge-batches.mjs";
import {
	DEFAULT_SCRATCH_DIR,
	sweepStaleScratchRoots,
	createRunScratchRoot,
	createFileScratchDir,
	removeScratchRoot,
	removeScratchRootSync
} from "./core/scratch.mjs";
import { assertUnshareWorks, inPidNamespace, ISOLATE_ENV, isolationRequested, runIsolated, shouldIsolate } from "./core/isolate.mjs";
import { getTimeoutsForFile, killChildProcessGroups, resolveFileTimeouts } from "./core/watchdog.mjs";

/**
 * @typedef {Object} PerFileHeapOverride
 * @property {string} pattern - Substring matched against the normalised file path.
 * @property {number} heapMb - Minimum heap ceiling in MB for matching files.
 */

/**
 * @typedef {Object} RunOptions
 * @property {string} [cwd=process.cwd()] - Absolute project root directory (defaults to `process.cwd()`).
 * @property {string} [testDir] - Directory to scan for test files (relative or absolute; defaults to `cwd`).
 * @property {string} [vitestConfig] - Explicit vitest config path; auto-detected from `cwd` when omitted.
 * @property {string[]} [testPatterns=[]] - File / folder patterns to filter (empty = all files in `testDir`).
 * @property {string} [testListFile] - Path to a JSON array of test file paths; when set, scanning is skipped.
 * @property {RegExp} [testFilePattern] - Regex matched against file names when scanning (default: `*.test.vitest.{js,mjs,cjs}`).
 * @property {string[]} [vitestArgs=[]] - Extra CLI args forwarded verbatim to every vitest invocation.
 * @property {boolean} [showErrorDetails=true] - Print inline error blocks under each failed file.
 * @property {boolean} [coverageQuiet=false] - Suppress per-file output; show only progress bar + summaries.
 * @property {boolean} [suppressFileOutput=false] - Suppress per-file runner output blocks in all modes.
 * @property {boolean} [suppressPassingFiles=false] - Hide passed-file rows in the final summary.
 * @property {boolean} [topSummary=true] - Show top memory and duration summary sections.
 * @property {boolean} [json=false] - Return a JSON run report instead of printing text output.
 * @property {number} [workers=4] - Maximum number of parallel worker slots.
 * @property {number} [worstCoverageCount=10] - Rows in the worst-coverage table (0 = disable).
 * @property {string} [blobsDir] - Directory for per-file coverage blobs (default `<cwd>/.vitest-coverage-blobs`). Relative paths resolve against `cwd`. Always cleared at the start of a coverage run.
 * @property {boolean} [mergeReports=true] - When `true`, blobs are merged via `vitest --mergeReports`, the coverage summary is printed, and `blobsDir` is deleted at the end. When `false`, the run stops after producing blobs: no merge, no summary, and `blobsDir` is left populated for an external merge step.
 * @property {number} [mergeBatchSize] - Blob count above which coverage blobs are merged in batches before the final `vitest --mergeReports`, so the merge stays within bounded memory however many test files there are. Each batch of up to this many blobs is merged into one blob in its own process, in rounds, until the count fits. Defaults to `VITEST_MERGE_BATCH_SIZE` or 50; `0` always merges in one process. Values below 2 are raised to 2.
 * @property {boolean} [coverageIndex=true] - With `mergeReports`, write `<reportsDirectory>/coverage-index.json` after the merge: for each source file, its functions and the test files that executed each one (module top-level code left out). Lets a repo re-run only the tests that reach one source file. `false` skips it.
 * @property {number} [maxOldSpaceMb] - Global `--max-old-space-size` ceiling; per-file overrides may raise it.
 * @property {number} [mergeMaxOldSpaceMb] - `--max-old-space-size` for the coverage merge only (the final `vitest --mergeReports` and each batch helper). Defaults to `VITEST_MERGE_HEAP_MB`, else `maxOldSpaceMb`. Lets a large suite give the merge more heap than each test file gets.
 * @property {string[]} [earlyRunPatterns=[]] - Path substrings — matching files run solo before the worker pool.
 * @property {string[]} [exclude=[]] - Directory / file globs, relative to `cwd`, that discovery never enters (e.g. `['tmp/**']`). Applies to both the default scan and partial-path pattern resolution.
 * @property {PerFileHeapOverride[]} [perFileHeapOverrides=[]] - Per-file minimum heap overrides.
 * @property {number} [fileTimeoutMs] - Longest one test file may run before its process group is killed and the file reported as failed. Defaults to `VITEST_FILE_TIMEOUT` (seconds) or 30 minutes; `0` = no limit.
 * @property {number} [fileIdleTimeoutMs] - Longest one test file may go without printing anything before it is killed the same way. Defaults to `VITEST_FILE_IDLE_TIMEOUT` (seconds) or 10 minutes; `0` = no limit.
 * @property {import('./core/watchdog.mjs').PerFileTimeoutOverride[]} [perFileTimeoutOverrides=[]] - Per-file limits for known slow files; the first matching `pattern` wins and replaces the limits it sets.
 * @property {string[]} [conditions=[]] - Additional `--conditions` Node flags forwarded to children.
 * @property {string} [nodeEnv='development'] - Value for `NODE_ENV` in child processes.
 * @property {string} [scratchDir='tmp/vitest-runner'] - Per-run scratch root, relative to `cwd` (or absolute). A subdirectory is created per file invocation and exposed to it via `VITEST_RUNNER_TMP`.
 * @property {boolean} [keepTmp=false] - Keep the run's scratch root instead of removing it on completion (normal exit, failure, or SIGINT/SIGTERM).
 * @property {boolean | "force"} [isolate] - Linux: run the whole suite in its own PID namespace, so a test's bad `kill` can only reach the run's own processes. The runner re-runs its own command line under `unshare -U --map-current-user -p -f --mount-proc` and returns that run's exit code; with `true` it's skipped when the process is already in a PID namespace (a container, a k3s pod), with `"force"` it re-runs anyway. Fails loudly when unprivileged namespaces aren't available. Defaults to `CLDMV_TEST_ISOLATE` (`1` or `force`). Can't be combined with `json`.
 * @property {string|false} [fsModuleCachePath] - Vitest 5+ `fsModuleCache` directory for every child, relative to `cwd` (or absolute). Takes precedence over `fsModuleCachePath` in the vitest config; a `--fsModuleCachePath` passthrough arg takes precedence over this. When unset, children use `<cwd>/node_modules/.vitest-cache` unless the resolved config (root or any project) sets a path. `false` adds nothing and leaves vitest's own setting in place.
 * @property {object[] | null} [_testResultsOverride=null] - @internal Inject pre-built results to bypass discovery and spawn (for testing final-report render paths).
 */

/**
 * Return the effective heap ceiling (MB) for a given test file.
 *
 * Takes the maximum of the global limit and the first matching per-file override.
 * Returns `undefined` when neither source provides a value.
 *
 * @param {string} filePath - Test file path.
 * @param {number|undefined} globalMaxMb - Global ceiling from options.
 * @param {PerFileHeapOverride[]} overrides - Per-file override table.
 * @returns {number|undefined}
 */
function getHeapForFile(filePath, globalMaxMb, overrides) {
	const normalized = filePath.replace(/\\/g, "/");
	let perFileMb;
	for (const { pattern, heapMb } of overrides) {
		if (normalized.includes(pattern)) {
			perFileMb = heapMb;
			break;
		}
	}
	if (perFileMb === undefined && globalMaxMb === undefined) return undefined;
	if (perFileMb === undefined) return globalMaxMb;
	if (globalMaxMb === undefined) return perFileMb;
	return Math.max(perFileMb, globalMaxMb);
}

/**
 * Run all discovered Vitest test files sequentially (with a configurable worker
 * pool for the non-solo phase) and return an exit code.
 *
 * With isolation on (`isolate` / `CLDMV_TEST_ISOLATE=1`) and not already in a PID namespace,
 * or with isolation forced (`"force"`) wherever it runs, it re-runs the process's own command
 * line in a new one and returns that run's exit code.
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
export async function run(opts) {
	if (shouldIsolate(isolationRequested(opts.isolate), { namespaced: inPidNamespace })) {
		if (process.platform !== "linux")
			throw new Error(`vitest-runner: isolation (isolate / ${ISOLATE_ENV}=1) needs Linux; this is ${process.platform}.`);
		if (opts.json) throw new Error("vitest-runner: isolation can't be combined with json: the isolated run prints its own output.");
		assertUnshareWorks();
		return runIsolated();
	}

	const cwd = opts.cwd ?? process.cwd();
	const scratchDirOpt = opts.scratchDir ?? DEFAULT_SCRATCH_DIR;
	const keepTmp = opts.keepTmp ?? false;

	await sweepStaleScratchRoots(cwd, scratchDirOpt);
	const { root: scratchRoot, release: releaseScratchRoot } = await createRunScratchRoot(cwd, scratchDirOpt);

	// Each test file runs in its own process group, out of reach of the terminal's Ctrl-C,
	// so the runner kills the live groups itself on a signal and on exit.
	const onSignal = () => {
		killChildProcessGroups();
		if (!keepTmp) removeScratchRootSync(scratchRoot);
		process.exitCode = 130;
		process.exit();
	};
	const onExit = () => killChildProcessGroups();

	process.once("SIGINT", onSignal);
	process.once("SIGTERM", onSignal);
	process.once("exit", onExit);

	try {
		return await runImpl(opts, scratchRoot);
	} finally {
		process.removeListener("SIGINT", onSignal);
		process.removeListener("SIGTERM", onSignal);
		process.removeListener("exit", onExit);
		// With keepTmp the hold stays until exit, so the next run sees a dead socket and sweeps the root.
		if (!keepTmp) {
			await releaseScratchRoot();
			await removeScratchRoot(scratchRoot);
		}
	}
}

/**
 * Write the coverage index (see core/coverage-index.mjs). A failure only warns:
 * the index is an extra, and the coverage run itself has already succeeded or failed.
 *
 * @param {Object} opts
 * @param {Array<{ blob: string, testFile: string }>} opts.entries
 * @param {string} opts.cwd
 * @param {string} opts.outputDir
 * @param {string} opts.vitestBin
 * @param {boolean} opts.log - Print the path written.
 * @param {boolean} opts.warn - Print a warning on failure.
 * @returns {Promise<{ path: string, files: number, testFiles: number } | null>}
 */
async function buildCoverageIndex({ entries, cwd, outputDir, vitestBin, log, warn }) {
	try {
		const vitestPkg = findVitestPackage(vitestBin);
		if (!vitestPkg) throw new Error("installed vitest package not found");
		const { flatted } = await loadBlobLibraries(vitestPkg.dir);
		const result = await writeCoverageIndex({ entries, cwd, outputDir, flatted });
		if (log)
			console.log(
				chalk.dim(`🗂️  Coverage index: ${path.relative(cwd, result.path)} (${result.files} source files, ${result.testFiles} test files)`)
			);
		return result;
	} catch (err) {
		if (warn) console.warn(chalk.yellow(`⚠️  Coverage index not written: ${err?.message ?? err}`));
		return null;
	}
}

/**
 * @param {RunOptions} opts
 * @param {string} scratchRoot - This run's scratch root (see {@link run}).
 * @returns {Promise<number|object>}
 */
async function runImpl(opts, scratchRoot) {
	const {
		cwd = process.cwd(),
		testDir,
		testPatterns = [],
		testListFile,
		testFilePattern,
		vitestArgs: rawVitestArgs = [],
		showErrorDetails = true,
		coverageQuiet = false,
		suppressFileOutput = false,
		suppressPassingFiles = false,
		topSummary = true,
		json = false,
		workers = parseInt(process.env.VITEST_WORKERS ?? "4", 10),
		worstCoverageCount = 10,
		blobsDir: blobsDirOpt,
		mergeReports = true,
		mergeBatchSize,
		coverageIndex = true,
		earlyRunPatterns = [],
		exclude = [],
		perFileHeapOverrides = [],
		fileTimeoutMs,
		fileIdleTimeoutMs,
		perFileTimeoutOverrides = [],
		conditions = [],
		nodeEnv = "development",
		fsModuleCachePath,
		/** @internal Inject pre-built results to bypass discovery and spawn (for testing final-report render paths). */
		_testResultsOverride = null
	} = opts;

	/** Unique index per file invocation, used to name that file's scratch subdirectory. */
	let fileScratchIndex = 0;

	const maxOldSpaceMb = opts.maxOldSpaceMb ?? (process.env.VITEST_HEAP_MB ? parseInt(process.env.VITEST_HEAP_MB, 10) : undefined);
	const mergeMaxOldSpaceMb =
		opts.mergeMaxOldSpaceMb ?? (process.env.VITEST_MERGE_HEAP_MB ? parseInt(process.env.VITEST_MERGE_HEAP_MB, 10) : maxOldSpaceMb);
	const emitTextOutput = !json;

	// Resolve vitest binary and config
	const vitestBin = resolveBin(cwd, "vitest", "vitest");
	const vitestConfig = await resolveVitestConfig(cwd, opts.vitestConfig);

	/** Common spawn options shared across all child invocations. */
	const spawnBase = { cwd, vitestBin, vitestConfig, conditions, nodeEnv };
	const fileTimeouts = resolveFileTimeouts({ timeoutMs: fileTimeoutMs, idleTimeoutMs: fileIdleTimeoutMs });

	const vitestArgs = [...rawVitestArgs];

	// fsModuleCache args for every child — see core/fs-cache.mjs. Kept apart from
	// vitestArgs so reports and JSON output show only the caller's own args.
	let cacheArgs = [];

	/**
	 * Decide the cache directory before any file runs and, when several files
	 * will start at once, do vitest's lockfile check once so parallel workers
	 * never clear the cache at the same time. The check is skipped when a solo
	 * file runs first (it does the check alone) or files never run in parallel.
	 * @param {string[]} soloFiles
	 * @param {string[]} parallelFiles
	 * @returns {Promise<void>}
	 */
	const prepareCache = async (soloFiles, parallelFiles) => {
		const warm = soloFiles.length === 0 && workers >= 2 && parallelFiles.length >= 2;
		const prepared = await prepareFsModuleCache({ ...spawnBase, vitestArgs, fsModuleCachePath, warm });
		cacheArgs = prepared.cacheArgs;
		// Without the helper the run still works, but parallel workers may race on the cache again.
		if (prepared.error && emitTextOutput) {
			console.warn(chalk.yellow(`⚠️  Vitest module cache setup skipped (${prepared.error}); running without it.`));
		}
	};

	// --coverage-quiet implies --coverage
	if (coverageQuiet && !vitestArgs.some((a) => a === "--coverage" || a.startsWith("--coverage."))) {
		vitestArgs.unshift("--coverage");
	}

	const hasCoverage = vitestArgs.some((a) => a === "--coverage" || a.startsWith("--coverage."));

	// ─── COVERAGE MODE ───────────────────────────────────────────────────────────
	if (hasCoverage) {
		const blobsDir = path.resolve(cwd, blobsDirOpt ?? ".vitest-coverage-blobs");
		// Temp coverage dirs live OUTSIDE blobsDir — vitest --mergeReports errors on
		// any non-blob entry found inside the blobs directory. They sit under this
		// run's own scratch root, so two runs in the same cwd never remove each
		// other's per-file coverage output (and a signal exit cleans them up too).
		const coverageTmpBase = path.join(scratchRoot, "coverage-tmp");

		await Promise.all([fs.rm(blobsDir, { recursive: true, force: true }), fs.rm(coverageTmpBase, { recursive: true, force: true })]);
		await Promise.all([fs.mkdir(blobsDir, { recursive: true }), fs.mkdir(coverageTmpBase, { recursive: true })]);

		const allTestFiles = await discoverVitestFiles({
			cwd,
			testDir,
			testPatterns,
			testListFile,
			testFilePattern,
			earlyRunPatterns,
			exclude
		});
		const filterConflicts = computeFilterConflicts(allTestFiles);

		if (allTestFiles.length === 0) {
			const noTestsMessage =
				testPatterns.length > 0 ? `❌ No Vitest test files found matching: ${testPatterns.join(", ")}` : "❌ No Vitest test files found";
			if (emitTextOutput) console.log(noTestsMessage);
			if (json) {
				return {
					exitCode: 1,
					mode: "coverage",
					message: noTestsMessage,
					options: {
						cwd,
						testDir,
						testPatterns,
						testListFile,
						workers,
						coverageQuiet,
						suppressFileOutput,
						suppressPassingFiles,
						topSummary,
						vitestArgs
					}
				};
			}
			return 1;
		}

		// Separate --coverage / --coverage.* args (merge step only) from other passthroughs
		const extraCoverageArgs = vitestArgs.filter((a) => a !== "--coverage" && a.startsWith("--coverage."));
		const nonCoveragePassthrough = vitestArgs.filter((a) => a !== "--coverage" && !a.startsWith("--coverage."));

		const soloFiles = allTestFiles.filter((f) => earlyRunPatterns.some((p) => f.replace(/\\/g, "/").includes(p)));
		const parallelFiles = allTestFiles.filter((f) => !earlyRunPatterns.some((p) => f.replace(/\\/g, "/").includes(p)));
		const suppressPerFileCoverageOutput = coverageQuiet || suppressFileOutput || json;
		const showCoverageProgress = coverageQuiet && !json;

		if (!coverageQuiet && !suppressFileOutput && emitTextOutput) {
			console.log(`\n🧪 Running ${allTestFiles.length} test files for coverage (blob + merge mode)`);
			console.log(`⚙️  Workers: ${workers} (${soloFiles.length} solo first, then parallel)`);
			if (maxOldSpaceMb) console.log(`🧠 Heap limit: ${maxOldSpaceMb} MB`);
			if (mergeReports && mergeMaxOldSpaceMb && mergeMaxOldSpaceMb !== maxOldSpaceMb)
				console.log(`🧠 Merge heap limit: ${mergeMaxOldSpaceMb} MB`);
			console.log("");
		}

		const progress = showCoverageProgress ? createCoverageProgressTracker(allTestFiles.length) : noopProgressTracker;
		const coverageResults = [];
		let blobIndex = 0;
		/** Each blob with the test file that writes it, for the coverage index. */
		const blobEntries = [];

		/**
		 * Run one file with the blob reporter and push its result.
		 * @param {string} filePath
		 * @returns {Promise<void>}
		 */
		const runCoverageFile = async (filePath) => {
			const blobPath = path.join(blobsDir, `run-${blobIndex}.blob`);
			blobIndex++;
			blobEntries.push({ blob: blobPath, testFile: filePath });

			if (!suppressPerFileCoverageOutput && emitTextOutput) {
				console.log(`\n${"=".repeat(80)}`);
				console.log(`▶️  ${filePath}`);
				console.log("=".repeat(80));
			}

			progress.onStart();

			const tmpCoverageDir = path.join(coverageTmpBase, `run-${blobIndex}`);
			const blobArgs = [
				...nonCoveragePassthrough,
				...cacheArgs,
				"--coverage",
				`--coverage.reportsDirectory=${tmpCoverageDir}`,
				"--reporter=default",
				"--reporter=blob",
				`--outputFile=${blobPath}`
			];

			const scratchDir = await createFileScratchDir(scratchRoot, fileScratchIndex++);
			const result = await runSingleFile(filePath, {
				...spawnBase,
				maxOldSpaceMb: getHeapForFile(filePath, maxOldSpaceMb, perFileHeapOverrides),
				...getTimeoutsForFile(filePath, fileTimeouts, perFileTimeoutOverrides),
				vitestArgs: blobArgs,
				streamOutput: !suppressPerFileCoverageOutput,
				// The default reporter prints nothing until the file ends, so report progress separately.
				heartbeat: true,
				excludePaths: filterConflicts.get(filePath),
				extraEnv: { VITEST_RUNNER_TMP: scratchDir }
			});

			coverageResults.push(result);
			progress.onComplete(result.code !== 0);

			if (!suppressPerFileCoverageOutput && emitTextOutput) {
				const durationSec = (result.duration / 1000).toFixed(2);
				if (result.code === 0) {
					const heapInfo = result.heapMb ? ` | ${result.heapMb} MB heap` : "";
					console.log(`\n✅ PASSED (${durationSec}s${heapInfo})\n`);
				} else {
					console.log(`\n❌ FAILED (exit code ${result.code}, ${durationSec}s)\n`);
				}
			}
		};

		await prepareCache(soloFiles, parallelFiles);

		// Phase 1: solo files — one at a time
		for (const filePath of soloFiles) {
			await runCoverageFile(filePath).catch((err) => {
				if (emitTextOutput) console.error(`Error running ${filePath}:`, err);
			});
		}

		// Phase 2: parallel files with worker pool
		let coverageFileIndex = 0;
		const coverageActivePromises = new Set();

		while (coverageFileIndex < parallelFiles.length || coverageActivePromises.size > 0) {
			while (coverageFileIndex < parallelFiles.length && coverageActivePromises.size < workers) {
				const filePath = parallelFiles[coverageFileIndex++];
				const promise = runCoverageFile(filePath)
					.catch((err) => {
						if (emitTextOutput) console.error(`Error running ${filePath}:`, err);
					})
					.finally(() => coverageActivePromises.delete(promise));
				coverageActivePromises.add(promise);
			}
			// c8 ignore next -- size is always >0 when the outer while body is reached
			if (coverageActivePromises.size > 0) await Promise.race(coverageActivePromises);
		}

		progress.finish();

		const blobFiles = (await fs.readdir(blobsDir).catch(() => [])).filter((f) => f.endsWith(".blob"));
		if (blobFiles.length === 0) {
			const message = "❌ No coverage blobs were generated — coverage report cannot be produced";
			if (emitTextOutput) console.error(message);
			if (json) {
				return {
					exitCode: 1,
					mode: "coverage",
					message,
					options: {
						cwd,
						testDir,
						testPatterns,
						testListFile,
						workers,
						coverageQuiet,
						suppressFileOutput,
						suppressPassingFiles,
						topSummary,
						showErrorDetails,
						worstCoverageCount,
						vitestArgs
					},
					totals: {
						testFiles: allTestFiles.length,
						failedFiles: coverageResults.filter((r) => r.code !== 0).length,
						passedFiles: coverageResults.filter((r) => r.code === 0).length
					},
					results: {
						all: coverageResults,
						failed: coverageResults.filter((r) => r.code !== 0)
					},
					merge: {
						blobFiles: 0,
						exitCode: 1,
						output: ""
					},
					coverageSummary: null
				};
			}
			return 1;
		}

		// When mergeReports is false, stop after producing the blobs: skip the merge
		// step and the coverage summary, and leave blobsDir intact so an external step
		// can merge these blobs together with a separately-produced blob set.
		let mergeExitCode = 0;
		let mergeOutput = "";
		let coverageSummary = null;
		let coverageIndexResult = null;

		if (mergeReports) {
			if (!coverageQuiet && !suppressFileOutput && emitTextOutput) {
				console.log(`\n${"=".repeat(80)}`);
				console.log(`📊 Merging ${blobFiles.length} coverage blobs into final report...`);
				console.log("=".repeat(80));
			}

			({ exitCode: mergeExitCode, output: mergeOutput } = await runMergeReports(blobsDir, {
				...spawnBase,
				maxOldSpaceMb: mergeMaxOldSpaceMb,
				extraCoverageArgs,
				extraArgs: cacheArgs,
				quietOutput: coverageQuiet || json,
				batchSize: mergeBatchSize,
				// Under the run's scratch root, so a signal exit removes it too (see run()).
				scratchDir: path.join(scratchRoot, "merge-batches")
			}));

			if (coverageQuiet && emitTextOutput) {
				printMergeOutput(mergeExitCode, mergeOutput);
			}

			coverageSummary = await printCoverageSummary(cwd, extraCoverageArgs, worstCoverageCount, { silent: json });

			// After the merge (which cleans the reports directory) and before the blobs are deleted.
			if (coverageIndex) {
				coverageIndexResult = await buildCoverageIndex({
					entries: blobEntries,
					cwd,
					outputDir: coverageSummary?.coverageDir ?? resolveCoverageDir(cwd, extraCoverageArgs),
					vitestBin,
					log: emitTextOutput && !coverageQuiet && !suppressFileOutput,
					warn: emitTextOutput
				});
			}
		}

		// Clean up temp dirs always; only delete blobsDir when we consumed it via merge.
		// With mergeReports:false the blobs must survive for the caller's external merge.
		await Promise.all([
			...(mergeReports ? [fs.rm(blobsDir, { recursive: true, force: true }).catch(() => {})] : []),
			fs.rm(coverageTmpBase, { recursive: true, force: true }).catch(() => {})
		]);

		const coverageFailed = coverageResults.filter((r) => r.code !== 0);
		if (coverageQuiet && emitTextOutput) printQuietCoverageFailureDetails(coverageFailed);

		const exitCode = coverageFailed.length > 0 ? 1 : mergeExitCode;
		if (json) {
			const coverageWithHeap = coverageResults.filter((r) => r.heapMb !== null);
			return {
				exitCode,
				mode: "coverage",
				options: {
					cwd,
					testDir,
					testPatterns,
					testListFile,
					workers,
					coverageQuiet,
					suppressFileOutput,
					suppressPassingFiles,
					topSummary,
					showErrorDetails,
					worstCoverageCount,
					vitestArgs
				},
				totals: {
					testFiles: allTestFiles.length,
					failedFiles: coverageFailed.length,
					passedFiles: coverageResults.length - coverageFailed.length
				},
				results: {
					all: coverageResults,
					failed: coverageFailed
				},
				merge: {
					blobFiles: blobFiles.length,
					exitCode: mergeExitCode,
					output: mergeOutput
				},
				coverageSummary,
				coverageIndex: coverageIndexResult,
				...(topSummary
					? {
							topMemoryUsers: [...coverageWithHeap].sort((a, b) => b.heapMb - a.heapMb).slice(0, 10),
							topDuration: [...coverageResults].sort((a, b) => b.duration - a.duration).slice(0, 10)
						}
					: {})
			};
		}

		return exitCode;
	}

	// ─── STANDARD (NON-COVERAGE) MODE ────────────────────────────────────────────
	const testFiles = await discoverVitestFiles({ cwd, testDir, testPatterns, testListFile, testFilePattern, earlyRunPatterns, exclude });
	const filterConflicts = computeFilterConflicts(testFiles);

	if (testFiles.length === 0) {
		const noTestsMessage =
			testPatterns.length > 0 ? `❌ No Vitest test files found matching: ${testPatterns.join(", ")}` : "❌ No Vitest test files found";
		if (emitTextOutput) console.log(noTestsMessage);
		if (json) {
			return {
				exitCode: 1,
				mode: "standard",
				message: noTestsMessage,
				options: {
					cwd,
					testDir,
					testPatterns,
					testListFile,
					workers,
					coverageQuiet,
					suppressFileOutput,
					suppressPassingFiles,
					topSummary,
					vitestArgs
				}
			};
		}
		return 1;
	}

	const soloFiles = testFiles.filter((f) => earlyRunPatterns.some((p) => f.replace(/\\/g, "/").includes(p)));
	const parallelFiles = testFiles.filter((f) => !earlyRunPatterns.some((p) => f.replace(/\\/g, "/").includes(p)));

	const scriptStartTime = Date.now();
	const scriptStartTimeFormatted = new Date().toLocaleTimeString("en-US", { hour12: false });

	if (emitTextOutput && !suppressFileOutput && testPatterns.length > 0) {
		console.log(`\n🧪 Running ${testFiles.length} test files matching: ${testPatterns.join(", ")}`);
	} else if (emitTextOutput && !suppressFileOutput) {
		console.log(`\n🧪 Running ${testFiles.length} test files (${soloFiles.length} solo first, then parallel)`);
	}
	if (emitTextOutput && !suppressFileOutput) {
		console.log(`⚙️  Workers: ${workers}`);
		if (maxOldSpaceMb) console.log(`🧠 Heap limit: ${maxOldSpaceMb} MB`);
		if (vitestArgs.length > 0) console.log(`🔧 Vitest args: ${vitestArgs.join(" ")}`);
		console.log("");
	}

	const results = [...(_testResultsOverride ?? [])];

	/**
	 * Run one test file, log progress, and return the result.
	 * @param {string} filePath
	 * @returns {Promise<import('./core/spawn.mjs').SingleFileResult>}
	 */
	const runTestFile = async (filePath) => {
		if (!suppressFileOutput && emitTextOutput) {
			console.log(`\n${"=".repeat(80)}`);
			console.log(`▶️  ${filePath}`);
			console.log("=".repeat(80));
		}

		const scratchDir = await createFileScratchDir(scratchRoot, fileScratchIndex++);
		const result = await runSingleFile(filePath, {
			...spawnBase,
			maxOldSpaceMb: getHeapForFile(filePath, maxOldSpaceMb, perFileHeapOverrides),
			...getTimeoutsForFile(filePath, fileTimeouts, perFileTimeoutOverrides),
			vitestArgs: [...vitestArgs, ...cacheArgs],
			streamOutput: !suppressFileOutput && !json,
			excludePaths: filterConflicts.get(filePath),
			extraEnv: { VITEST_RUNNER_TMP: scratchDir }
		});

		if (!suppressFileOutput && emitTextOutput) {
			const durationSec = (result.duration / 1000).toFixed(2);
			if (result.code === 0) {
				const heapInfo = result.heapMb ? ` | ${result.heapMb} MB heap` : "";
				console.log(`\n✅ PASSED (${durationSec}s${heapInfo})\n`);
			} else {
				console.log(`\n❌ FAILED (exit code ${result.code}, ${durationSec}s)\n`);
			}
		}

		return result;
	};

	if (!_testResultsOverride) {
		await prepareCache(soloFiles, parallelFiles);

		// Phase 1: solo files
		for (const filePath of soloFiles) {
			const result = await runTestFile(filePath).catch((err) => {
				if (emitTextOutput) console.error(`Error running ${filePath}:`, err);
				return null;
			});
			if (result) results.push(result);
		}

		// Phase 2: parallel files with worker pool
		let index = 0;
		const activePromises = new Set();

		while (index < parallelFiles.length || activePromises.size > 0) {
			while (index < parallelFiles.length && activePromises.size < workers) {
				const filePath = parallelFiles[index++];
				const promise = runTestFile(filePath)
					.then((result) => results.push(result))
					.catch((err) => {
						if (emitTextOutput) console.error(`Error running ${filePath}:`, err);
					})
					.finally(() => activePromises.delete(promise));
				activePromises.add(promise);
			}
			// c8 ignore next -- size is always >0 when the outer while body is reached
			if (activePromises.size > 0) await Promise.race(activePromises);
		}
	}

	// ─── FINAL REPORT ────────────────────────────────────────────────────────────
	const totalTestFilesPass = results.reduce((s, r) => s + r.testFilesPass, 0);
	const totalTestFilesFail = results.reduce((s, r) => s + r.testFilesFail, 0);
	const totalTestsPass = results.reduce((s, r) => s + r.testsPass, 0);
	const totalTestsFail = results.reduce((s, r) => s + r.testsFail, 0);
	const totalTestsSkip = results.reduce((s, r) => s + (r.testsSkip || 0), 0);
	const totalDuration = results.reduce((s, r) => s + r.duration, 0);
	const failedFiles = results.filter((r) => r.code !== 0);
	const passedFiles = results.filter((r) => r.code === 0);
	const exitCode = failedFiles.length > 0 ? 1 : 0;
	const scriptMemory = process.memoryUsage();
	const scriptHeapMb = Math.round(scriptMemory.heapUsed / 1024 / 1024);
	const scriptRssMb = Math.round(scriptMemory.rss / 1024 / 1024);
	const withHeap = results.filter((r) => r.heapMb !== null);
	const actualDurationSec = ((Date.now() - scriptStartTime) / 1000).toFixed(2);
	const testsDurationSec = (totalDuration / 1000).toFixed(2);

	if (json) {
		return {
			exitCode,
			mode: "standard",
			options: {
				cwd,
				testDir,
				testPatterns,
				testListFile,
				workers,
				coverageQuiet,
				suppressFileOutput,
				suppressPassingFiles,
				topSummary,
				showErrorDetails,
				worstCoverageCount,
				vitestArgs
			},
			totals: {
				testFilesPass: totalTestFilesPass,
				testFilesFail: totalTestFilesFail,
				testsPass: totalTestsPass,
				testsFail: totalTestsFail,
				testsSkip: totalTestsSkip,
				totalTests: totalTestsPass + totalTestsFail + totalTestsSkip
			},
			timing: {
				startAt: scriptStartTimeFormatted,
				wallClockSeconds: Number(actualDurationSec),
				testsSeconds: Number(testsDurationSec)
			},
			heap: {
				scriptHeapMb,
				scriptRssMb,
				maxHeapMb: withHeap.length > 0 ? Math.max(...withHeap.map((r) => r.heapMb)) : null,
				avgHeapMb: withHeap.length > 0 ? Number((withHeap.reduce((sum, r) => sum + r.heapMb, 0) / withHeap.length).toFixed(0)) : null
			},
			results: {
				all: results,
				passed: passedFiles,
				failed: failedFiles
			},
			...(topSummary
				? {
						topMemoryUsers: [...withHeap].sort((a, b) => b.heapMb - a.heapMb).slice(0, 10),
						topDuration: [...results].sort((a, b) => b.duration - a.duration).slice(0, 10)
					}
				: {})
		};
	}

	console.log("\n" + "=".repeat(80));

	// Top memory users
	if (topSummary && withHeap.length > 0) {
		console.log("\n" + chalk.bold("🧠 TOP MEMORY USERS"));
		console.log("-".repeat(80));
		[...withHeap]
			.sort((a, b) => b.heapMb - a.heapMb)
			.slice(0, 10)
			.forEach((r) => {
				console.log(`  ${String(r.heapMb).padStart(4)} MB  ${chalk.dim(r.file)}`);
			});
	}

	// Top duration
	if (topSummary && results.length > 0) {
		console.log("\n" + chalk.bold("⏱️  TOP DURATION"));
		console.log("-".repeat(80));
		[...results]
			.sort((a, b) => b.duration - a.duration)
			.slice(0, 10)
			.forEach((r) => {
				const sec = (r.duration / 1000).toFixed(2);
				console.log(`  ${(sec + "s").padStart(8)}  ${chalk.dim(r.file)}`);
			});
	}

	// Passed files
	if (passedFiles.length > 0 && !suppressPassingFiles) {
		console.log("\n" + "=".repeat(80));
		console.log(chalk.bold.green("✓ PASSED TEST FILES"));
		console.log("=".repeat(80));
		passedFiles.forEach((r) => {
			const durationSec = (r.duration / 1000).toFixed(2);
			const statsInfo = [...(r.heapMb ? [`${r.heapMb} MB`] : []), `${durationSec}s`];
			const testInfo = r.testsPass > 0 ? ` - ${r.testsPass} tests` : "";
			console.log(chalk.green(`✓ ${r.file}${testInfo}`) + chalk.dim(` (${statsInfo.join(", ")})`));
		});
	}

	// Summary banner
	console.log("\n" + chalk.bold("=".repeat(80)));

	if (failedFiles.length > 0) {
		console.log(`\n❌ ${failedFiles.length} test file(s) failed`);
		console.log(chalk.bold.red("\nFailed Test Files:"));

		failedFiles.forEach((r) => {
			const durationSec = (r.duration / 1000).toFixed(2);
			const testCounts = [
				...(r.testsFail > 0 ? [chalk.red(`${r.testsFail} failed`)] : []),
				...(r.testsPass > 0 ? [chalk.green(`${r.testsPass} passed`)] : []),
				...(r.testsSkip > 0 ? [chalk.yellow(`${r.testsSkip} skipped`)] : [])
			];
			const statsInfo = [...(r.heapMb ? [`${r.heapMb} MB`] : []), `${durationSec}s`];
			const countStr = testCounts.length > 0 ? ` (${testCounts.join(", ")})` : "";
			console.log(`  ${chalk.red("✖")} ${r.file}${countStr}` + chalk.dim(` [${statsInfo.join(", ")}]`));

			if (showErrorDetails && r.errors.length > 0) {
				const deduped = deduplicateErrors(r.errors)
					.split("\n")
					.map((line) => (line.trim() ? `    ${line}` : ""))
					.join("\n");
				console.log(deduped);
				console.log("");
			}
		});

		console.log("");
	}

	console.log(chalk.bold("=".repeat(80)));

	// Vitest-style summary lines
	if (totalTestFilesFail > 0 && totalTestFilesPass > 0) {
		console.log(
			` ${chalk.bold("Test Files")}  ${chalk.red(`${totalTestFilesFail} failed`)} ${chalk.dim("|")} ${chalk.green(`${totalTestFilesPass} passed`)} ${chalk.dim(`(${totalTestFilesPass + totalTestFilesFail})`)}`
		);
	} else if (totalTestFilesFail > 0) {
		console.log(` ${chalk.bold("Test Files")}  ${chalk.red(`${totalTestFilesFail} failed`)} ${chalk.dim(`(${totalTestFilesFail})`)}`);
	} else {
		console.log(` ${chalk.bold("Test Files")}  ${chalk.green(`${totalTestFilesPass} passed`)} ${chalk.dim(`(${totalTestFilesPass})`)}`);
	}

	const totalTests = totalTestsPass + totalTestsFail + totalTestsSkip;
	const testsParts = [
		...(totalTestsFail > 0 ? [chalk.red(`${totalTestsFail} failed`)] : []),
		...(totalTestsPass > 0 ? [chalk.green(`${totalTestsPass} passed`)] : []),
		...(totalTestsSkip > 0 ? [chalk.yellow(`${totalTestsSkip} skipped`)] : [])
	];
	console.log(`      ${chalk.bold("Tests")}  ${testsParts.join(` ${chalk.dim("|")} `)} ${chalk.dim(`(${totalTests})`)}`);
	console.log(`   ${chalk.bold("Start at")}  ${scriptStartTimeFormatted}`);

	console.log(`   ${chalk.bold("Duration")}  ${actualDurationSec}s ${chalk.dim(`(tests ${testsDurationSec}s)`)}`);

	if (withHeap.length > 0) {
		const maxHeap = Math.max(...withHeap.map((r) => r.heapMb));
		const avgHeap = (withHeap.reduce((s, r) => s + r.heapMb, 0) / withHeap.length).toFixed(0);
		console.log(`       ${chalk.bold("Heap")}  max ${maxHeap} MB | avg ${avgHeap} MB | script ${scriptHeapMb} MB (RSS ${scriptRssMb} MB)`);
	} else {
		console.log(`       ${chalk.bold("Heap")}  script ${scriptHeapMb} MB (RSS ${scriptRssMb} MB)`);
	}

	if (failedFiles.length > 0) return 1;

	console.log(`\n✅ All ${passedFiles.length} test files passed\n`);
	return 0;
}

// Re-export sub-module utilities so callers can use them without deep imports
export { resolveBin, resolveVitestConfig } from "./utils/resolve.mjs";
export { discoverVitestFiles, sortWithPriority, discoverFilesInDir } from "./core/discover.mjs";
export { parseVitestOutput, deduplicateErrors } from "./core/parse.mjs";
export { runSingleFile, runVitestDirect, runMergeReports } from "./core/spawn.mjs";
export { createCoverageProgressTracker, noopProgressTracker } from "./core/progress.mjs";
export { printCoverageSummary, printMergeOutput, printQuietCoverageFailureDetails } from "./core/report.mjs";
export { formatDuration } from "./utils/duration.mjs";
export { stripAnsi, colourPct } from "./utils/ansi.mjs";
export { buildNodeOptions } from "./utils/env.mjs";
export { makeRunTmpDir } from "./core/scratch.mjs";
export { prepareFsModuleCache, DEFAULT_FS_MODULE_CACHE_DIR } from "./core/fs-cache.mjs";
export { DEFAULT_MERGE_BATCH_SIZE, resolveMergeBatchSize } from "./core/merge-batches.mjs";
export { COVERAGE_INDEX_FILENAME, writeCoverageIndexFromBlobs } from "./core/coverage-index.mjs";
export {
	DEFAULT_FILE_IDLE_TIMEOUT_MS,
	DEFAULT_FILE_TIMEOUT_MS,
	killChildProcessGroups,
	liveChildCount,
	resolveFileTimeouts
} from "./core/watchdog.mjs";
