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
 * @param {Pick<SpawnBaseOptions, 'maxOldSpaceMb'|'conditions'|'nodeEnv'>} opts
 * @returns {NodeJS.ProcessEnv}
 */
function buildEnv({ maxOldSpaceMb, conditions = [], nodeEnv = "development" }) {
	const env = { ...process.env };
	if (!env.NODE_ENV) env.NODE_ENV = nodeEnv;

	const nodeOptions = buildNodeOptions({ maxOldSpaceMb, conditions, base: env.NODE_OPTIONS ?? "" });
	if (nodeOptions) env.NODE_OPTIONS = nodeOptions;

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
 * @param {SpawnBaseOptions & { vitestArgs?: string[], streamOutput?: boolean }} opts
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
		streamOutput = true
	} = opts;

	return new Promise((resolve) => {
		const startTime = Date.now();
		const args = [...buildBaseArgs(vitestBin, vitestConfig), ...vitestArgs, filePath];
		const env = buildEnv({ maxOldSpaceMb, conditions, nodeEnv });

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
