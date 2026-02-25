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
 * // Run every test file found under src/tests/
 * import { run } from 'vitest-runner';
 * const code = await run({ cwd: process.cwd(), testDir: 'src/tests' });
 * process.exit(code);
 *
 * @example
 * // Run a subset with custom heap limit
 * const code = await run({
 *   cwd: process.cwd(),
 *   testDir: 'src/tests',
 *   testPatterns: ['src/tests/config'],
 *   maxOldSpaceMb: 4096,
 * });
 */

import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";

import { resolveBin, resolveVitestConfig } from "./utils/resolve.mjs";
import { discoverVitestFiles } from "./core/discover.mjs";
import { runSingleFile, runMergeReports } from "./core/spawn.mjs";
import { deduplicateErrors } from "./core/parse.mjs";
import { createCoverageProgressTracker, noopProgressTracker } from "./core/progress.mjs";
import { printQuietCoverageFailureDetails, printMergeOutput, printCoverageSummary } from "./core/report.mjs";
import { formatDuration } from "./utils/duration.mjs";
import { colourPct } from "./utils/ansi.mjs";

/**
 * @typedef {Object} PerFileHeapOverride
 * @property {string} pattern - Substring matched against the normalised file path.
 * @property {number} heapMb - Minimum heap ceiling in MB for matching files.
 */

/**
 * @typedef {Object} RunOptions
 * @property {string} cwd - Absolute project root directory.
 * @property {string} [testDir] - Directory to scan for test files (relative or absolute; defaults to `cwd`).
 * @property {string} [vitestConfig] - Explicit vitest config path; auto-detected from `cwd` when omitted.
 * @property {string[]} [testPatterns=[]] - File / folder patterns to filter (empty = all files in `testDir`).
 * @property {string} [testListFile] - Path to a JSON array of test file paths; when set, scanning is skipped.
 * @property {RegExp} [testFilePattern] - Regex matched against file names when scanning (default: `*.test.vitest.{js,mjs,cjs}`).
 * @property {string[]} [vitestArgs=[]] - Extra CLI args forwarded verbatim to every vitest invocation.
 * @property {boolean} [showErrorDetails=true] - Print inline error blocks under each failed file.
 * @property {boolean} [coverageQuiet=false] - Suppress per-file output; show only progress bar + summaries.
 * @property {number} [workers=4] - Maximum number of parallel worker slots.
 * @property {number} [worstCoverageCount=10] - Rows in the worst-coverage table (0 = disable).
 * @property {number} [maxOldSpaceMb] - Global `--max-old-space-size` ceiling; per-file overrides may raise it.
 * @property {string[]} [earlyRunPatterns=[]] - Path substrings — matching files run solo before the worker pool.
 * @property {PerFileHeapOverride[]} [perFileHeapOverrides=[]] - Per-file minimum heap overrides.
 * @property {string[]} [conditions=[]] - Additional `--conditions` Node flags forwarded to children.
 * @property {string} [nodeEnv='development'] - Value for `NODE_ENV` in child processes.
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
 * @param {RunOptions} opts
 * @returns {Promise<number>} `0` on full pass, `1` on any failure.
 */
export async function run(opts) {
	const {
		cwd,
		testDir,
		testPatterns = [],
		testListFile,
		testFilePattern,
		vitestArgs: rawVitestArgs = [],
		showErrorDetails = true,
		coverageQuiet = false,
		workers = parseInt(process.env.VITEST_WORKERS ?? "4", 10),
		worstCoverageCount = 10,
		earlyRunPatterns = [],
		perFileHeapOverrides = [],
		conditions = [],
		nodeEnv = "development"
	} = opts;

	const maxOldSpaceMb = opts.maxOldSpaceMb ?? (process.env.VITEST_HEAP_MB ? parseInt(process.env.VITEST_HEAP_MB, 10) : undefined);

	// Resolve vitest binary and config
	const vitestBin = resolveBin(cwd, "vitest", "vitest");
	const vitestConfig = await resolveVitestConfig(cwd, opts.vitestConfig);

	/** Common spawn options shared across all child invocations. */
	const spawnBase = { cwd, vitestBin, vitestConfig, conditions, nodeEnv };

	const vitestArgs = [...rawVitestArgs];

	// --coverage-quiet implies --coverage
	if (coverageQuiet && !vitestArgs.some((a) => a === "--coverage" || a.startsWith("--coverage."))) {
		vitestArgs.unshift("--coverage");
	}

	const hasCoverage = vitestArgs.some((a) => a === "--coverage" || a.startsWith("--coverage."));

	// ─── COVERAGE MODE ───────────────────────────────────────────────────────────
	if (hasCoverage) {
		const blobsDir = path.resolve(cwd, ".vitest-coverage-blobs");
		// Temp coverage dirs live OUTSIDE blobsDir — vitest --mergeReports errors on
		// any non-blob entry found inside the blobs directory.
		const coverageTmpBase = path.resolve(cwd, ".vitest-coverage-tmp");

		await Promise.all([fs.rm(blobsDir, { recursive: true, force: true }), fs.rm(coverageTmpBase, { recursive: true, force: true })]);
		await Promise.all([fs.mkdir(blobsDir, { recursive: true }), fs.mkdir(coverageTmpBase, { recursive: true })]);

		const allTestFiles = await discoverVitestFiles({ cwd, testDir, testPatterns, testListFile, testFilePattern, earlyRunPatterns });

		if (allTestFiles.length === 0) {
			console.log(
				testPatterns.length > 0 ? `❌ No Vitest test files found matching: ${testPatterns.join(", ")}` : "❌ No Vitest test files found"
			);
			return 1;
		}

		// Separate --coverage / --coverage.* args (merge step only) from other passthroughs
		const extraCoverageArgs = vitestArgs.filter((a) => a !== "--coverage" && a.startsWith("--coverage."));
		const nonCoveragePassthrough = vitestArgs.filter((a) => a !== "--coverage" && !a.startsWith("--coverage."));

		const soloFiles = allTestFiles.filter((f) => earlyRunPatterns.some((p) => f.replace(/\\/g, "/").includes(p)));
		const parallelFiles = allTestFiles.filter((f) => !earlyRunPatterns.some((p) => f.replace(/\\/g, "/").includes(p)));

		if (!coverageQuiet) {
			console.log(`\n🧪 Running ${allTestFiles.length} test files for coverage (blob + merge mode)`);
			console.log(`⚙️  Workers: ${workers} (${soloFiles.length} solo first, then parallel)`);
			if (maxOldSpaceMb) console.log(`🧠 Heap limit: ${maxOldSpaceMb} MB`);
			console.log("");
		}

		const progress = coverageQuiet ? createCoverageProgressTracker(allTestFiles.length) : noopProgressTracker;
		const coverageResults = [];
		let blobIndex = 0;

		/**
		 * Run one file with the blob reporter and push its result.
		 * @param {string} filePath
		 * @returns {Promise<void>}
		 */
		const runCoverageFile = async (filePath) => {
			const blobPath = path.join(blobsDir, `run-${blobIndex}.blob`);
			blobIndex++;

			if (!coverageQuiet) {
				console.log(`\n${"=".repeat(80)}`);
				console.log(`▶️  ${filePath}`);
				console.log("=".repeat(80));
			}

			progress.onStart();

			const tmpCoverageDir = path.join(coverageTmpBase, `run-${blobIndex}`);
			const blobArgs = [
				...nonCoveragePassthrough,
				"--coverage",
				`--coverage.reportsDirectory=${tmpCoverageDir}`,
				"--reporter=default",
				"--reporter=blob",
				`--outputFile=${blobPath}`
			];

			const result = await runSingleFile(filePath, {
				...spawnBase,
				maxOldSpaceMb: getHeapForFile(filePath, maxOldSpaceMb, perFileHeapOverrides),
				vitestArgs: blobArgs,
				streamOutput: !coverageQuiet
			});

			coverageResults.push(result);
			progress.onComplete(result.code !== 0);

			if (!coverageQuiet) {
				const durationSec = (result.duration / 1000).toFixed(2);
				if (result.code === 0) {
					const heapInfo = result.heapMb ? ` | ${result.heapMb} MB heap` : "";
					console.log(`\n✅ PASSED (${durationSec}s${heapInfo})\n`);
				} else {
					console.log(`\n❌ FAILED (exit code ${result.code}, ${durationSec}s)\n`);
				}
			}
		};

		// Phase 1: solo files — one at a time
		for (const filePath of soloFiles) {
			await runCoverageFile(filePath).catch((err) => console.error(`Error running ${filePath}:`, err));
		}

		// Phase 2: parallel files with worker pool
		let coverageFileIndex = 0;
		const coverageActivePromises = new Set();

		while (coverageFileIndex < parallelFiles.length || coverageActivePromises.size > 0) {
			while (coverageFileIndex < parallelFiles.length && coverageActivePromises.size < workers) {
				const filePath = parallelFiles[coverageFileIndex++];
				const promise = runCoverageFile(filePath)
					.catch((err) => console.error(`Error running ${filePath}:`, err))
					.finally(() => coverageActivePromises.delete(promise));
				coverageActivePromises.add(promise);
			}
			if (coverageActivePromises.size > 0) await Promise.race(coverageActivePromises);
		}

		progress.finish();

		const blobFiles = (await fs.readdir(blobsDir).catch(() => [])).filter((f) => f.endsWith(".blob"));
		if (blobFiles.length === 0) {
			console.error("❌ No coverage blobs were generated — coverage report cannot be produced");
			return 1;
		}

		if (!coverageQuiet) {
			console.log(`\n${"=".repeat(80)}`);
			console.log(`📊 Merging ${blobFiles.length} coverage blobs into final report...`);
			console.log("=".repeat(80));
		}

		const { exitCode: mergeExitCode, output: mergeOutput } = await runMergeReports(blobsDir, {
			...spawnBase,
			maxOldSpaceMb,
			extraCoverageArgs,
			quietOutput: coverageQuiet
		});

		if (coverageQuiet) {
			printMergeOutput(mergeExitCode, mergeOutput);
		}

		await printCoverageSummary(cwd, extraCoverageArgs, worstCoverageCount);

		// Clean up blobs and temp dirs
		await Promise.all([
			fs.rm(blobsDir, { recursive: true, force: true }).catch(() => {}),
			fs.rm(coverageTmpBase, { recursive: true, force: true }).catch(() => {})
		]);

		const coverageFailed = coverageResults.filter((r) => r.code !== 0);
		if (coverageQuiet) printQuietCoverageFailureDetails(coverageFailed);

		return coverageFailed.length > 0 ? 1 : mergeExitCode;
	}

	// ─── STANDARD (NON-COVERAGE) MODE ────────────────────────────────────────────
	const testFiles = await discoverVitestFiles({ cwd, testDir, testPatterns, testListFile, testFilePattern, earlyRunPatterns });

	if (testFiles.length === 0) {
		console.log(
			testPatterns.length > 0 ? `❌ No Vitest test files found matching: ${testPatterns.join(", ")}` : "❌ No Vitest test files found"
		);
		return 1;
	}

	const soloFiles = testFiles.filter((f) => earlyRunPatterns.some((p) => f.replace(/\\/g, "/").includes(p)));
	const parallelFiles = testFiles.filter((f) => !earlyRunPatterns.some((p) => f.replace(/\\/g, "/").includes(p)));

	const scriptStartTime = Date.now();
	const scriptStartTimeFormatted = new Date().toLocaleTimeString("en-US", { hour12: false });

	if (testPatterns.length > 0) {
		console.log(`\n🧪 Running ${testFiles.length} test files matching: ${testPatterns.join(", ")}`);
	} else {
		console.log(`\n🧪 Running ${testFiles.length} test files (${soloFiles.length} solo first, then parallel)`);
	}
	console.log(`⚙️  Workers: ${workers}`);
	if (maxOldSpaceMb) console.log(`🧠 Heap limit: ${maxOldSpaceMb} MB`);
	if (vitestArgs.length > 0) console.log(`🔧 Vitest args: ${vitestArgs.join(" ")}`);
	console.log("");

	const results = [];

	/**
	 * Run one test file, log progress, and return the result.
	 * @param {string} filePath
	 * @returns {Promise<import('./core/spawn.mjs').SingleFileResult>}
	 */
	const runTestFile = async (filePath) => {
		console.log(`\n${"=".repeat(80)}`);
		console.log(`▶️  ${filePath}`);
		console.log("=".repeat(80));

		const result = await runSingleFile(filePath, {
			...spawnBase,
			maxOldSpaceMb: getHeapForFile(filePath, maxOldSpaceMb, perFileHeapOverrides),
			vitestArgs
		});

		const durationSec = (result.duration / 1000).toFixed(2);
		if (result.code === 0) {
			const heapInfo = result.heapMb ? ` | ${result.heapMb} MB heap` : "";
			console.log(`\n✅ PASSED (${durationSec}s${heapInfo})\n`);
		} else {
			console.log(`\n❌ FAILED (exit code ${result.code}, ${durationSec}s)\n`);
		}

		return result;
	};

	// Phase 1: solo files
	for (const filePath of soloFiles) {
		const result = await runTestFile(filePath).catch((err) => {
			console.error(`Error running ${filePath}:`, err);
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
				.catch((err) => console.error(`Error running ${filePath}:`, err))
				.finally(() => activePromises.delete(promise));
			activePromises.add(promise);
		}
		if (activePromises.size > 0) await Promise.race(activePromises);
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

	console.log("\n" + "=".repeat(80));

	// Top memory users
	const withHeap = results.filter((r) => r.heapMb !== null);
	if (withHeap.length > 0) {
		console.log("\n" + chalk.bold("🧠 TOP MEMORY USERS"));
		console.log("-".repeat(80));
		[...withHeap]
			.sort((a, b) => (b.heapMb ?? 0) - (a.heapMb ?? 0))
			.slice(0, 10)
			.forEach((r) => {
				console.log(`  ${String(r.heapMb).padStart(4)} MB  ${chalk.dim(r.file)}`);
			});
	}

	// Top duration
	if (results.length > 0) {
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
	if (passedFiles.length > 0) {
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

	const actualDurationSec = ((Date.now() - scriptStartTime) / 1000).toFixed(2);
	const testsDurationSec = (totalDuration / 1000).toFixed(2);
	console.log(`   ${chalk.bold("Duration")}  ${actualDurationSec}s ${chalk.dim(`(tests ${testsDurationSec}s)`)}`);

	const scriptMemory = process.memoryUsage();
	const scriptHeapMb = Math.round(scriptMemory.heapUsed / 1024 / 1024);
	const scriptRssMb = Math.round(scriptMemory.rss / 1024 / 1024);
	if (withHeap.length > 0) {
		const maxHeap = Math.max(...withHeap.map((r) => r.heapMb ?? 0));
		const avgHeap = (withHeap.reduce((s, r) => s + (r.heapMb ?? 0), 0) / withHeap.length).toFixed(0);
		console.log(`       ${chalk.bold("Heap")}  max ${maxHeap} MB | avg ${avgHeap} MB | script ${scriptHeapMb} MB (RSS ${scriptRssMb} MB)`);
	} else {
		console.log(`       ${chalk.bold("Heap")}  script ${scriptHeapMb} MB (RSS ${scriptRssMb} MB)`);
	}

	if (failedFiles.length > 0) {
		return 1;
	}

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
