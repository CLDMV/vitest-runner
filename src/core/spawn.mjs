/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /src/core/spawn.mjs
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
 * @fileoverview Child-process spawning helpers for running vitest.
 * @module vitest-runner/src/core/spawn
 */

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HEARTBEAT_FD_ENV } from "./heartbeat-reporter.mjs";
import { parseVitestOutput } from "./parse.mjs";
import { buildEnv } from "../utils/env.mjs";
import { formatLimit, KILL_GRACE_MS, killProcessGroup, tailLines, trackChild, usesProcessGroups } from "./watchdog.mjs";
import {
	findVitestPackage,
	isSupportedVitestVersion,
	reduceBlobsInBatches,
	resolveMergeBatchSize,
	SUPPORTED_VITEST_MAJORS
} from "./merge-batches.mjs";

/**
 * @typedef {Object} SpawnBaseOptions
 * @property {string} cwd - Working directory for the child process.
 * @property {string} vitestBin - Absolute path to the vitest binary.
 * @property {string|undefined} vitestConfig - Vitest config path (omit to let vitest auto-detect).
 * @property {number|undefined} maxOldSpaceMb - Optional `--max-old-space-size` ceiling.
 * @property {string[]} [conditions=[]] - Additional `--conditions` flags.
 * @property {string} [nodeEnv='development'] - Value for `NODE_ENV`.
 */

/**
 * Build the base argument list `[vitestBin, ...configArgs, 'run']`.
 * @param {string} vitestBin
 * @param {string|undefined} vitestConfig
 * @returns {string[]}
 */
function buildBaseArgs(vitestBin, vitestConfig) {
	const configArgs = vitestConfig ? ["--config", vitestConfig] : [];
	return [vitestBin, ...configArgs, "run"];
}

/**
 * @typedef {Object} SingleFileResult
 * @property {string} file - Test file path.
 * @property {number} code - Process exit code.
 * @property {number} duration - Run duration in milliseconds.
 * @property {number} testFilesPass
 * @property {number} testFilesFail
 * @property {number} testsPass
 * @property {number} testsFail
 * @property {number} testsSkip
 * @property {number|null} heapMb
 * @property {string[]} errors
 * @property {string} rawOutput
 * @property {string} [timedOut] - Why the watchdog killed the file, when it did.
 */

/** The heartbeat reporter, next to this module in src/ and next to the bundle in dist/ and bin/. */
export const HEARTBEAT_REPORTER_PATH = fileURLToPath(new URL("./heartbeat-reporter.mjs", import.meta.url));

/**
 * Run a single Vitest test file in a child process and return parsed results.
 *
 * @param {string} filePath - Test file path (relative to `cwd` or absolute).
 * The child runs in its own process group (POSIX). With `timeoutMs` or `idleTimeoutMs` set,
 * a file that runs longer than `timeoutMs`, or prints nothing for `idleTimeoutMs`, has its
 * whole group killed (SIGTERM, then SIGKILL after `killGraceMs`) and is reported as failed
 * with the reason and its last output lines. `0` or unset means no limit.
 *
 * With `heartbeat`, the child also loads core/heartbeat-reporter.mjs, which writes to an
 * extra pipe while tests make progress. That counts as output for the idle limit, so a
 * file whose reporters print nothing until the end (coverage runs) isn't taken for idle.
 *
 * @param {SpawnBaseOptions & { vitestArgs?: string[], streamOutput?: boolean, excludePaths?: string[], extraEnv?: NodeJS.ProcessEnv, timeoutMs?: number, idleTimeoutMs?: number, killGraceMs?: number, heartbeat?: boolean }} opts
 * @returns {Promise<SingleFileResult>}
 * @example
 * const result = await runSingleFile('src/tests/foo.test.vitest.mjs', {
 *   cwd: '/project',
 *   vitestBin: '/project/node_modules/.bin/vitest',
 *   vitestConfig: '/project/vitest.config.ts',
 * });
 */
export function runSingleFile(filePath, opts) {
	const {
		cwd,
		vitestBin,
		vitestConfig,
		maxOldSpaceMb,
		conditions = [],
		nodeEnv = "development",
		vitestArgs = [],
		streamOutput = true,
		// Other discovered files whose path would spuriously also match Vitest's
		// own substring filter on `filePath` (see discover.mjs computeFilterConflicts).
		// Excluded explicitly so this invocation runs exactly `filePath`.
		excludePaths = [],
		// Extra env vars for the child (e.g. VITEST_RUNNER_TMP — see core/scratch.mjs).
		extraEnv = {},
		// Watchdog limits (see core/watchdog.mjs); 0 or unset = no limit.
		timeoutMs = 0,
		idleTimeoutMs = 0,
		killGraceMs = KILL_GRACE_MS,
		heartbeat = false
	} = opts;

	return new Promise((resolve) => {
		const startTime = Date.now();
		const excludeArgs = excludePaths.flatMap((p) => ["--exclude", p]);
		const heartbeatArgs = heartbeat ? [`--reporter=${HEARTBEAT_REPORTER_PATH}`] : [];
		const args = [...buildBaseArgs(vitestBin, vitestConfig), ...vitestArgs, ...heartbeatArgs, ...excludeArgs, filePath];
		const env = buildEnv({ maxOldSpaceMb, conditions, nodeEnv, extraEnv: heartbeat ? { ...extraEnv, [HEARTBEAT_FD_ENV]: "3" } : extraEnv });
		/** @type {import("node:child_process").StdioOptions} */
		const stdio = heartbeat ? ["ignore", "pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"];

		// Its own process group, so a kill reaches vitest's workers and anything a test started.
		const child = spawn(process.execPath, args, { cwd, stdio, env, detached: usesProcessGroups() });
		const untrack = trackChild(child);

		let stdout = "";
		let stderr = "";
		/** @type {string|undefined} */
		let timedOut;
		let settled = false;
		/** @type {NodeJS.Timeout[]} */
		const timers = [];
		let idleTimer;

		const settle = (result) => {
			if (settled) return;
			settled = true;
			for (const timer of timers) clearTimeout(timer);
			clearTimeout(idleTimer);
			untrack();
			resolve(result);
		};

		const buildResult = (code) => {
			const spawnDuration = Date.now() - startTime;
			const output = `${stdout}\n${stderr}`;
			const parsed = parseVitestOutput(output);
			const result = {
				file: filePath,
				code: code ?? 1,
				// c8 ignore next -- false branch verified manually; V8 ternary probe mismatch inside object literal
				duration: parsed.duration > 0 ? parsed.duration : spawnDuration,
				testFilesPass: parsed.testFilesPass,
				testFilesFail: parsed.testFilesFail,
				testsPass: parsed.testsPass,
				testsFail: parsed.testsFail,
				testsSkip: parsed.testsSkip,
				heapMb: parsed.heapMb,
				errors: parsed.errors,
				rawOutput: output
			};
			if (timedOut === undefined) return result;
			const tail = tailLines(output);
			return {
				...result,
				code: 1,
				duration: spawnDuration,
				testFilesPass: 0,
				testFilesFail: 1,
				errors: [`${timedOut}; killed its process group.${tail ? ` Last output:\n${tail}` : " It printed nothing."}`, ...parsed.errors],
				timedOut
			};
		};

		const fire = (reason) => {
			if (timedOut !== undefined) return;
			timedOut = reason;
			if (streamOutput) process.stderr.write(`\n⏱️  ${filePath}: ${reason}; killing its process group\n`);
			killProcessGroup(child, "SIGTERM");
			timers.push(
				setTimeout(() => {
					killProcessGroup(child, "SIGKILL");
					// A process that left the group can still hold the output pipes open, and then
					// "close" never comes. Give it one more grace period, then report without it.
					timers.push(
						setTimeout(() => {
							child.stdout?.destroy();
							child.stderr?.destroy();
							child.stdio[3]?.destroy();
							settle(buildResult(null));
						}, killGraceMs).unref()
					);
				}, killGraceMs).unref()
			);
		};

		if (timeoutMs > 0) {
			timers.push(setTimeout(() => fire(`ran longer than ${formatLimit(timeoutMs)}`), timeoutMs).unref());
		}
		const resetIdle = () => {
			if (idleTimeoutMs <= 0 || timedOut !== undefined) return;
			clearTimeout(idleTimer);
			idleTimer = setTimeout(() => fire(`printed nothing for ${formatLimit(idleTimeoutMs)}`), idleTimeoutMs).unref();
		};
		resetIdle();

		child.stdout?.on("data", (data) => {
			stdout += data.toString();
			resetIdle();
			if (streamOutput) process.stdout.write(data);
		});

		child.stderr?.on("data", (data) => {
			stderr += data.toString();
			resetIdle();
			if (streamOutput) process.stderr.write(data);
		});

		// The heartbeat pipe carries no output, only progress.
		child.stdio[3]?.on("data", resetIdle);

		child.on("close", (code) => settle(buildResult(code)));

		child.on("error", (err) => {
			settle({
				file: filePath,
				code: 1,
				duration: Date.now() - startTime,
				testFilesPass: 0,
				testFilesFail: 1,
				testsPass: 0,
				testsFail: 0,
				testsSkip: 0,
				heapMb: null,
				errors: [err.message],
				rawOutput: err.toString()
			});
		});
	});
}

/**
 * Run Vitest directly (all files in one process) with inherited stdio.
 *
 * @param {SpawnBaseOptions & { vitestArgs?: string[] }} opts
 * @returns {Promise<number>} Process exit code.
 * @example
 * const code = await runVitestDirect({
 *   cwd: '/project',
 *   vitestBin: '/project/node_modules/.bin/vitest',
 *   vitestArgs: ['--reporter=verbose'],
 * });
 */
export function runVitestDirect(opts) {
	const { cwd, vitestBin, vitestConfig, maxOldSpaceMb, conditions = [], nodeEnv = "development", vitestArgs = [] } = opts;

	return new Promise((resolve) => {
		const args = [...buildBaseArgs(vitestBin, vitestConfig), ...vitestArgs];
		const env = buildEnv({ maxOldSpaceMb, conditions, nodeEnv });

		const child = spawn(process.execPath, args, { cwd, stdio: "inherit", env });
		child.on("close", (code) => resolve(code ?? 1));
		child.on("error", () => resolve(1));
	});
}

/**
 * Merge blob reports from individual coverage runs into a single coverage report
 * using `vitest --mergeReports`.
 *
 * When `blobsDir` holds more blobs than `batchSize`, the blobs are first reduced
 * in rounds (each batch merged into one blob in its own helper process, see
 * core/merge-batches.mjs) so the final `vitest --mergeReports` never has to hold
 * every coverage map at once. At or below `batchSize` nothing changes. The
 * reduction's files live under `scratchDir` and are removed on every exit path.
 * If the installed vitest or the blobs don't have the supported layout, the run
 * falls back to merging all blobs in one process and says so.
 *
 * @param {string} blobsDir - Directory containing the `.blob` files to merge.
 * @param {SpawnBaseOptions & { extraCoverageArgs?: string[], extraArgs?: string[], quietOutput?: boolean, batchSize?: number, scratchDir?: string }} opts
 *   `batchSize` defaults to `VITEST_MERGE_BATCH_SIZE` or 50 (`0` = never batch).
 *   `scratchDir` defaults to a directory next to `blobsDir`.
 * @returns {Promise<{ exitCode: number, output: string }>}
 * @example
 * const { exitCode } = await runMergeReports('/project/.vitest-blobs', {
 *   cwd: '/project',
 *   vitestBin: '/project/node_modules/.bin/vitest',
 * });
 */
export async function runMergeReports(blobsDir, opts) {
	const { cwd, vitestBin, maxOldSpaceMb, nodeEnv = "development", quietOutput = false } = opts;
	const batchSize = resolveMergeBatchSize(opts.batchSize);

	let notes = "";
	/** @param {string} msg */
	const log = (msg) => {
		if (quietOutput) notes += `${msg}\n`;
		else console.log(msg);
	};
	/** @param {{ exitCode: number, output: string }} result */
	const withNotes = (result) => (notes ? { ...result, output: `${notes}${result.output}` } : result);

	if (batchSize === 0) return spawnMergeReports(blobsDir, opts);

	let entries;
	try {
		entries = await fs.readdir(path.resolve(cwd, blobsDir), { withFileTypes: true });
	} catch {
		// Let vitest report the missing/unreadable directory exactly as before.
		return spawnMergeReports(blobsDir, opts);
	}
	if (entries.length <= batchSize) return spawnMergeReports(blobsDir, opts);

	// vitest --mergeReports rejects any non-file entry; leave that error to vitest.
	if (entries.some((e) => !e.isFile())) return spawnMergeReports(blobsDir, opts);

	const absBlobsDir = path.resolve(cwd, blobsDir);
	const blobFiles = entries
		.map((e) => e.name)
		.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
		.map((name) => path.join(absBlobsDir, name));

	let vitestPkg;
	try {
		vitestPkg = findVitestPackage(vitestBin);
	} catch {
		vitestPkg = null;
	}
	if (!vitestPkg || !isSupportedVitestVersion(vitestPkg.version)) {
		const found = vitestPkg ? `vitest ${vitestPkg.version}` : "an unknown vitest version";
		log(
			`⚠️  Batched coverage merge supports vitest ${SUPPORTED_VITEST_MAJORS.join(", ")}.x; found ${found}. Merging all ${blobFiles.length} blobs in one process.`
		);
		return withNotes(await spawnMergeReports(blobsDir, opts));
	}

	const scratchDir = path.resolve(
		opts.scratchDir ?? path.join(path.dirname(absBlobsDir), `.${path.basename(absBlobsDir)}-merge-${process.pid}-${Date.now()}`)
	);

	try {
		await fs.rm(scratchDir, { recursive: true, force: true });
		await fs.mkdir(scratchDir, { recursive: true });

		const reduced = await reduceBlobsInBatches({
			blobFiles,
			scratchDir,
			batchSize,
			vitestDir: vitestPkg.dir,
			vitestVersion: vitestPkg.version,
			cwd,
			maxOldSpaceMb,
			nodeEnv,
			log
		});

		if (!reduced.ok) {
			const why = reduced.unsupported ? "blob layout not supported" : "batch merge failed";
			log(`⚠️  ${why} (${reduced.message}). Merging all ${blobFiles.length} blobs in one process.`);
			return withNotes(await spawnMergeReports(blobsDir, opts));
		}

		log(`🧩 Reduced ${blobFiles.length} blobs to ${reduced.count} in ${reduced.rounds} round(s); running the final merge.`);
		return withNotes(await spawnMergeReports(reduced.dir, opts));
	} finally {
		await fs.rm(scratchDir, { recursive: true, force: true }).catch(() => {});
	}
}

/**
 * Spawn one `vitest --mergeReports <dir> --run --coverage` process.
 *
 * @param {string} blobsDir
 * @param {SpawnBaseOptions & { extraCoverageArgs?: string[], extraArgs?: string[], quietOutput?: boolean }} opts
 * @returns {Promise<{ exitCode: number, output: string }>}
 */
function spawnMergeReports(blobsDir, opts) {
	const {
		cwd,
		vitestBin,
		vitestConfig,
		maxOldSpaceMb,
		conditions = [],
		nodeEnv = "development",
		extraCoverageArgs = [],
		// Non-coverage args for the merge process (e.g. --fsModuleCachePath — see core/fs-cache.mjs).
		extraArgs = [],
		quietOutput = false
	} = opts;

	return new Promise((resolve) => {
		const configArgs = vitestConfig ? ["--config", vitestConfig] : [];
		const mergeReporterArgs = quietOutput ? ["--color"] : [];

		const args = [
			vitestBin,
			...configArgs,
			"--mergeReports",
			blobsDir,
			"--run",
			"--coverage",
			...mergeReporterArgs,
			...extraCoverageArgs,
			...extraArgs
		];

		const env = buildEnv({ maxOldSpaceMb, conditions, nodeEnv });
		const child = spawn(process.execPath, args, {
			cwd,
			stdio: quietOutput ? ["ignore", "pipe", "pipe"] : "inherit",
			env
		});

		let stdout = "";
		let stderr = "";

		if (quietOutput) {
			child.stdout?.on("data", (data) => (stdout += data.toString()));
			child.stderr?.on("data", (data) => (stderr += data.toString()));
		}

		child.on("close", (code) => resolve({ exitCode: code ?? 1, output: `${stdout}\n${stderr}` }));
		child.on("error", () => resolve({ exitCode: 1, output: "" }));
	});
}
