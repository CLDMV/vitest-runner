/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /src/core/spawn.mjs
 *	@Date: 2026-02-24T22:33:55-08:00 (1772001235)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-21T11:56:12-08:00 (1795290972)
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
import { parseVitestOutput } from "./parse.mjs";
import { buildEnv } from "../utils/env.mjs";
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
 */

/**
 * Run a single Vitest test file in a child process and return parsed results.
 *
 * @param {string} filePath - Test file path (relative to `cwd` or absolute).
 * @param {SpawnBaseOptions & { vitestArgs?: string[], streamOutput?: boolean, excludePaths?: string[], extraEnv?: NodeJS.ProcessEnv }} opts
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
		extraEnv = {}
	} = opts;

	return new Promise((resolve) => {
		const startTime = Date.now();
		const excludeArgs = excludePaths.flatMap((p) => ["--exclude", p]);
		const args = [...buildBaseArgs(vitestBin, vitestConfig), ...vitestArgs, ...excludeArgs, filePath];
		const env = buildEnv({ maxOldSpaceMb, conditions, nodeEnv, extraEnv });

		const child = spawn(process.execPath, args, { cwd, stdio: ["ignore", "pipe", "pipe"], env });

		let stdout = "";
		let stderr = "";

		child.stdout?.on("data", (data) => {
			stdout += data.toString();
			if (streamOutput) process.stdout.write(data);
		});

		child.stderr?.on("data", (data) => {
			stderr += data.toString();
			if (streamOutput) process.stderr.write(data);
		});

		child.on("close", (code) => {
			const spawnDuration = Date.now() - startTime;
			const output = `${stdout}\n${stderr}`;
			const parsed = parseVitestOutput(output);

			resolve({
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
			});
		});

		child.on("error", (err) => {
			resolve({
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
