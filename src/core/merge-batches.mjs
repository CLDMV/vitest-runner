/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /src/core/merge-batches.mjs
 *	@Date: 2026-11-21T11:52:17-08:00 (1795290737)
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
 * @fileoverview Bounded-memory merging of coverage blobs before `vitest --mergeReports`.
 * @module vitest-runner/src/core/merge-batches
 *
 * `vitest --mergeReports` reads and parses every blob in the directory at once,
 * and each blob carries a coverage map of the whole include set. With hundreds
 * of blobs that one process runs out of heap after every test has passed.
 *
 * When the blob count is above the batch size, the blobs are reduced in rounds
 * first: each round merges up to `batchSize` blobs into one blob, each reduction
 * in its own helper process (merge-batches-helper.mjs), until the count fits.
 * The final `vitest --mergeReports` then runs over the reduced set, so reporters,
 * thresholds and the exit code behave as before.
 *
 * A reduced blob is written in the exact layout vitest's blob reporter writes:
 * a `flatted` string of `[version, files, errors, coverage, executionTime,
 * environmentModules]`. `flatted` and `@vitest/istanbul-lib-coverage` are loaded
 * from the installed vitest's own dependencies, never bundled. The layout was
 * verified against vitest 5.x; any other major, or any blob that doesn't have
 * that shape, makes the caller fall back to the single merge.
 */

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildEnv } from "../utils/env.mjs";

/** Blob count above which blobs are reduced in batches before the final merge. */
export const DEFAULT_MERGE_BATCH_SIZE = 50;

/** Env var that overrides the default batch size (an explicit option wins). */
export const MERGE_BATCH_SIZE_ENV = "VITEST_MERGE_BATCH_SIZE";

/** Vitest majors whose blob layout the reducer was verified against. */
export const SUPPORTED_VITEST_MAJORS = Object.freeze([5]);

/** Exit code the helper uses when a blob doesn't have the expected layout. */
export const UNSUPPORTED_EXIT_CODE = 3;

/**
 * Resolve the batch size from the option, then the env var, then the default.
 *
 * `0` turns batching off (always one merge). Any other value below 2 would never
 * reduce the count, so it is raised to 2. Non-numeric values are ignored.
 *
 * @param {number|string|undefined} value - Explicit option value.
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @returns {number} `0` (disabled) or an integer ≥ 2.
 * @example
 * resolveMergeBatchSize(undefined); // 50, or VITEST_MERGE_BATCH_SIZE when set
 * resolveMergeBatchSize(0);         // 0 → batching off
 */
export function resolveMergeBatchSize(value, env = process.env) {
	for (const candidate of [value, env[MERGE_BATCH_SIZE_ENV]]) {
		if (candidate === undefined || candidate === null || candidate === "") continue;
		const n = Math.floor(Number(candidate));
		if (!Number.isFinite(n) || n < 0) continue;
		if (n === 0) return 0;
		return Math.max(2, n);
	}
	return DEFAULT_MERGE_BATCH_SIZE;
}

/**
 * Find the installed vitest package (directory + version) that owns `vitestBin`.
 *
 * @param {string} vitestBin - Absolute path to the vitest binary.
 * @returns {{ dir: string, version: string } | null} `null` when no vitest package.json is found above the binary.
 */
export function findVitestPackage(vitestBin) {
	let dir = path.dirname(fsSync.realpathSync(vitestBin));
	for (;;) {
		const pkgPath = path.join(dir, "package.json");
		try {
			const pkg = JSON.parse(fsSync.readFileSync(pkgPath, "utf8"));
			if (pkg.name === "vitest" && typeof pkg.version === "string") return { dir, version: pkg.version };
		} catch {
			// no (readable) package.json here — keep walking up
		}
		const parent = path.dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

/**
 * Whether the batched merge supports this vitest version.
 *
 * @param {string} version - Installed vitest version.
 * @returns {boolean}
 */
export function isSupportedVitestVersion(version) {
	const major = parseInt(String(version).split(".")[0], 10);
	return SUPPORTED_VITEST_MAJORS.includes(major);
}

/**
 * Load `flatted` and `@vitest/istanbul-lib-coverage` from the installed vitest's
 * own dependencies, so the reducer reads and writes blobs with the same code vitest uses.
 *
 * @param {string} vitestDir - The vitest package directory (see {@link findVitestPackage}).
 * @returns {Promise<{ flatted: { parse: Function, stringify: Function }, libCoverage: { createCoverageMap: Function } }>}
 */
export async function loadBlobLibraries(vitestDir) {
	const require = createRequire(path.join(vitestDir, "package.json"));
	const flatted = require("flatted");
	const libCoverage = await import(pathToFileURL(require.resolve("@vitest/istanbul-lib-coverage")).href);
	return { flatted, libCoverage };
}

/** Thrown when a blob doesn't have the layout the reducer was written for. */
export class UnsupportedBlobError extends Error {}

/**
 * Check that a parsed blob has vitest 5's layout.
 *
 * @param {unknown} blob - The `flatted.parse` result of one blob file.
 * @param {string} expectedVersion - Installed vitest version.
 * @param {string} file - Blob path, for the error message.
 * @returns {void}
 * @throws {UnsupportedBlobError}
 */
export function assertBlobShape(blob, expectedVersion, file) {
	const fail = (why) => {
		throw new UnsupportedBlobError(`${path.basename(file)}: ${why}`);
	};
	if (!Array.isArray(blob) || blob.length !== 6) fail("not a 6-field blob array");
	const [version, files, errors, coverage, executionTime, environmentModules] = /** @type {unknown[]} */ (blob);
	if (version !== expectedVersion) fail(`written by vitest ${String(version)}, installed is ${expectedVersion}`);
	if (!Array.isArray(files)) fail("files is not an array");
	if (!Array.isArray(errors)) fail("errors is not an array");
	if (coverage !== undefined && coverage !== null && typeof coverage !== "object") fail("coverage is not an object");
	if (typeof executionTime !== "number") fail("executionTime is not a number");
	if (!environmentModules || typeof environmentModules !== "object") fail("environmentModules is not an object");
	for (const project of Object.values(environmentModules)) {
		if (!project || typeof project !== "object" || !project.environments || typeof project.environments !== "object") {
			fail("environmentModules project has no environments");
		}
		if (!Array.isArray(project.external)) fail("environmentModules project has no external list");
		for (const graph of Object.values(project.environments)) {
			if (!graph || !Array.isArray(graph.idTable) || !Array.isArray(graph.modules)) fail("module graph has no idTable/modules");
		}
	}
}

/**
 * Accumulates the serialized module graphs of several blobs into one, keeping
 * each module once (by module id) and the union of its imports.
 */
export class EnvironmentModulesAccumulator {
	/** @type {Map<string, { environments: Map<string, Map<string, { file: string, url: string, imports: Set<string> }>>, external: Map<string, unknown> }>} */
	#projects = new Map();

	/**
	 * Add one blob's `environmentModules`.
	 * @param {Record<string, { environments: Record<string, { idTable: string[], modules: [number, number, number, number[]][] }>, external: [string, unknown][] }>} environmentModules
	 * @returns {void}
	 */
	add(environmentModules) {
		for (const [projectName, project] of Object.entries(environmentModules)) {
			let acc = this.#projects.get(projectName);
			if (!acc) {
				acc = { environments: new Map(), external: new Map() };
				this.#projects.set(projectName, acc);
			}
			for (const [id, externalized] of project.external) acc.external.set(id, externalized);
			for (const [envName, graph] of Object.entries(project.environments)) {
				let modules = acc.environments.get(envName);
				if (!modules) {
					modules = new Map();
					acc.environments.set(envName, modules);
				}
				const { idTable } = graph;
				for (const [id, file, url, importedIds] of graph.modules) {
					const moduleId = idTable[id];
					let entry = modules.get(moduleId);
					if (!entry) {
						entry = { file: idTable[file], url: idTable[url], imports: new Set() };
						modules.set(moduleId, entry);
					}
					for (const importedId of importedIds) entry.imports.add(idTable[importedId]);
				}
			}
		}
	}

	/**
	 * Serialize back to the layout vitest's blob reporter writes.
	 * @returns {Record<string, { environments: Record<string, { idTable: string[], modules: [number, number, number, number[]][] }>, external: [string, unknown][] }>}
	 */
	toJSON() {
		/** @type {Record<string, any>} */
		const out = {};
		for (const [projectName, acc] of this.#projects) {
			const environments = {};
			for (const [envName, modules] of acc.environments) {
				const idTable = [];
				const idMap = new Map();
				const indexOf = (id) => {
					let index = idMap.get(id);
					if (index === undefined) {
						index = idTable.length;
						idMap.set(id, index);
						idTable.push(id);
					}
					return index;
				};
				const serialized = [];
				for (const [moduleId, { file, url, imports }] of modules) {
					serialized.push([indexOf(moduleId), indexOf(file), indexOf(url), [...imports].map(indexOf)]);
				}
				environments[envName] = { idTable, modules: serialized };
			}
			out[projectName] = { environments, external: [...acc.external] };
		}
		return out;
	}
}

/**
 * Merge several blob files into one blob file, reading them one at a time so
 * only one input blob is parsed in memory at once.
 *
 * `files` and `errors` are concatenated, coverage maps are merged with
 * istanbul's `CoverageMap.merge`, execution times are summed (vitest sums them
 * for its duration line too) and module graphs are unioned by module id.
 *
 * @param {Object} opts
 * @param {string[]} opts.inputs - Blob files to merge.
 * @param {string} opts.output - Path of the merged blob to write.
 * @param {string} opts.expectedVersion - Installed vitest version; every input must match.
 * @param {{ parse: Function, stringify: Function }} opts.flatted - vitest's `flatted`.
 * @param {{ createCoverageMap: Function }} opts.libCoverage - vitest's `@vitest/istanbul-lib-coverage`.
 * @returns {Promise<void>}
 * @throws {UnsupportedBlobError} When an input doesn't have the expected layout.
 */
export async function reduceBlobFiles({ inputs, output, expectedVersion, flatted, libCoverage }) {
	const files = [];
	const errors = [];
	const environmentModules = new EnvironmentModulesAccumulator();
	let coverageMap = null;
	let executionTime = 0;

	for (const input of inputs) {
		const blob = flatted.parse(await fs.readFile(input, "utf-8"));
		assertBlobShape(blob, expectedVersion, input);
		const [, blobFiles, blobErrors, coverage, blobExecutionTime, blobEnvironmentModules] = blob;

		for (const file of blobFiles) files.push(file);
		for (const error of blobErrors) errors.push(error);
		executionTime += blobExecutionTime;
		environmentModules.add(blobEnvironmentModules);

		if (coverage !== undefined && coverage !== null) {
			try {
				coverageMap ??= libCoverage.createCoverageMap({});
				coverageMap.merge(coverage);
			} catch (err) {
				throw new UnsupportedBlobError(`${path.basename(input)}: coverage is not an istanbul coverage map (${err.message})`);
			}
		}
	}

	const content = flatted.stringify([expectedVersion, files, errors, coverageMap ?? undefined, executionTime, environmentModules.toJSON()]);
	await fs.writeFile(output, content, "utf-8");
}

/**
 * Split `items` into consecutive groups of at most `size`.
 * @template T
 * @param {T[]} items
 * @param {number} size
 * @returns {T[][]}
 */
export function chunk(items, size) {
	const groups = [];
	for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size));
	return groups;
}

/**
 * Run one reduction in a helper process.
 *
 * @param {Object} opts
 * @param {string} opts.jobFile - JSON job file for the helper.
 * @param {string} opts.cwd
 * @param {number|undefined} opts.maxOldSpaceMb - Heap ceiling for the helper.
 * @param {string} opts.nodeEnv
 * @param {string} [opts.helperPath] - Override the helper script (tests).
 * @returns {Promise<{ code: number, message: string }>}
 */
function runReduceHelper({ jobFile, cwd, maxOldSpaceMb, nodeEnv, helperPath }) {
	const helper = helperPath ?? fileURLToPath(new URL("./merge-batches-helper.mjs", import.meta.url));
	return new Promise((resolve) => {
		const env = buildEnv({ maxOldSpaceMb, nodeEnv });
		const child = spawn(process.execPath, [helper, jobFile], { cwd, stdio: ["ignore", "pipe", "pipe"], env });
		let stdout = "";
		let stderr = "";
		child.stdout?.on("data", (d) => (stdout += d.toString()));
		child.stderr?.on("data", (d) => (stderr = (stderr + d.toString()).slice(-4000)));
		child.on("close", (code) => {
			// split() always returns at least one element, so pop() is never undefined.
			const last = /** @type {string} */ (stdout.trim().split("\n").pop());
			let message;
			try {
				message = JSON.parse(last).message ?? "";
			} catch {
				message = stderr.trim().split("\n").slice(-5).join("\n");
			}
			resolve({ code: code ?? 1, message });
		});
		child.on("error", (err) => resolve({ code: 1, message: err.message }));
	});
}

/**
 * Reduce the blobs in `blobsDir` in rounds until at most `batchSize` remain.
 *
 * Every round writes its blobs to a fresh `round-<n>` directory under
 * `scratchDir` and removes the previous round's directory. `blobsDir` itself is
 * never modified. The caller owns `scratchDir` and removes it afterwards.
 *
 * @param {Object} opts
 * @param {string[]} opts.blobFiles - Absolute paths of the input blobs.
 * @param {string} opts.scratchDir - Empty directory this function may write into.
 * @param {number} opts.batchSize - Blobs per reduction (≥ 2).
 * @param {string} opts.vitestDir - Installed vitest package directory.
 * @param {string} opts.vitestVersion - Installed vitest version.
 * @param {string} opts.cwd
 * @param {number|undefined} opts.maxOldSpaceMb - Heap ceiling for each helper.
 * @param {string} [opts.nodeEnv='development']
 * @param {(msg: string) => void} [opts.log] - Progress messages.
 * @param {string} [opts.helperPath] - Override the helper script (tests).
 * @returns {Promise<{ ok: boolean, dir?: string, rounds?: number, count?: number, unsupported?: boolean, message?: string }>}
 *   `ok: true` with the final directory, round count and blob count; or `ok: false`
 *   with `unsupported` (a blob had an unknown layout) and the helper's `message`.
 */
export async function reduceBlobsInBatches(opts) {
	const {
		blobFiles,
		scratchDir,
		batchSize,
		vitestDir,
		vitestVersion,
		cwd,
		maxOldSpaceMb,
		nodeEnv = "development",
		log = () => {},
		helperPath
	} = opts;

	const jobsDir = path.join(scratchDir, "jobs");
	await fs.mkdir(jobsDir, { recursive: true });

	let current = blobFiles;
	let previousDir = null;
	let round = 0;

	while (current.length > batchSize) {
		round++;
		const roundDir = path.join(scratchDir, `round-${round}`);
		await fs.mkdir(roundDir, { recursive: true });
		const groups = chunk(current, batchSize);
		log(`🧩 Merge round ${round}: ${current.length} blobs → ${groups.length} (batches of up to ${batchSize})`);

		const outputs = [];
		for (const [index, group] of groups.entries()) {
			const output = path.join(roundDir, `merged-${index}.blob`);
			if (group.length === 1) {
				await fs.copyFile(group[0], output);
			} else {
				const jobFile = path.join(jobsDir, `round-${round}-${index}.json`);
				await fs.writeFile(jobFile, JSON.stringify({ vitestDir, expectedVersion: vitestVersion, inputs: group, output }));
				const { code, message } = await runReduceHelper({ jobFile, cwd, maxOldSpaceMb, nodeEnv, helperPath });
				if (code !== 0) {
					return { ok: false, unsupported: code === UNSUPPORTED_EXIT_CODE, message: message || `merge helper exited with code ${code}` };
				}
			}
			outputs.push(output);
		}

		if (previousDir) await fs.rm(previousDir, { recursive: true, force: true });
		previousDir = roundDir;
		current = outputs;
	}

	return { ok: true, dir: previousDir ?? path.dirname(blobFiles[0]), rounds: round, count: current.length };
}
