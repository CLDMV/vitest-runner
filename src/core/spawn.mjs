/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /src/core/spawn.mjs
 *	@Date: 2026-02-24T22:33:55-08:00 (1772001235)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-10-02T15:35:22-07:00 (1790980522)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * @fileoverview Child-process spawning helpers for running vitest.
 * @module vitest-runner/src/core/spawn
 */

import { spawn } from "node:child_process";
import { parseVitestOutput } from "./parse.mjs";
import { buildNodeOptions } from "../utils/env.mjs";

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
 * Build the environment object for a vitest child process.
 * @param {Pick<SpawnBaseOptions, 'maxOldSpaceMb'|'conditions'|'nodeEnv'> & { extraEnv?: NodeJS.ProcessEnv }} opts
 * @returns {NodeJS.ProcessEnv}
 */
function buildEnv({ maxOldSpaceMb, conditions = [], nodeEnv = "development", extraEnv = {} }) {
	const env = { ...process.env };
	if (!env.NODE_ENV) env.NODE_ENV = nodeEnv;

	const nodeOptions = buildNodeOptions({ maxOldSpaceMb, conditions, base: env.NODE_OPTIONS ?? "" });
	if (nodeOptions) env.NODE_OPTIONS = nodeOptions;

	Object.assign(env, extraEnv);

	return env;
}

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
 * @param {string} blobsDir - Directory containing the `.blob` files to merge.
 * @param {SpawnBaseOptions & { extraCoverageArgs?: string[], quietOutput?: boolean }} opts
 * @returns {Promise<{ exitCode: number, output: string }>}
 * @example
 * const { exitCode } = await runMergeReports('/project/.vitest-blobs', {
 *   cwd: '/project',
 *   vitestBin: '/project/node_modules/.bin/vitest',
 * });
 */
export function runMergeReports(blobsDir, opts) {
	const {
		cwd,
		vitestBin,
		vitestConfig,
		maxOldSpaceMb,
		conditions = [],
		nodeEnv = "development",
		extraCoverageArgs = [],
		quietOutput = false
	} = opts;

	return new Promise((resolve) => {
		const configArgs = vitestConfig ? ["--config", vitestConfig] : [];
		const mergeReporterArgs = quietOutput ? ["--color"] : [];

		const args = [vitestBin, ...configArgs, "--mergeReports", blobsDir, "--run", "--coverage", ...mergeReporterArgs, ...extraCoverageArgs];

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
