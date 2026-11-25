/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /src/core/coverage-index.mjs
 *	@Date: 2026-11-25T02:46:52-08:00 (1795603612)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-25T02:47:16-08:00 (1795603636)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * @fileoverview Coverage index: which test files executed which source functions.
 * @module vitest-runner/src/core/coverage-index
 *
 * A coverage run writes one blob per test file. Before the blobs are deleted,
 * {@link writeCoverageIndex} reads them one at a time and writes
 * `<reportsDirectory>/coverage-index.json`:
 *
 * ```json
 * {
 *   "version": 1,
 *   "commit": "<sha or null>",
 *   "files": {
 *     "src/lib/run-snapshot.mjs": {
 *       "takeSnapshot": ["tests/run-snapshot-edges.test.vitest.mjs"],
 *       "copyOnWrite": []
 *     }
 *   }
 * }
 * ```
 *
 * A function lists a test file when its call count in that file's blob is above
 * zero. Only the coverage map's functions (`fnMap`) are indexed, so module
 * top-level code never counts: loading a package runs every module's top level,
 * which would list every test against every file. Every function in the map is
 * listed, with `[]` when no test reached it. A name that occurs more than once in
 * one file is keyed `name@<line>` for each occurrence. Paths are relative to the
 * project root with forward slashes, so the index is portable between CI and a
 * local checkout.
 *
 * With the index a repo can re-measure one source file by running only the test
 * files that reach it instead of the whole suite.
 */

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

/** File name of the index inside the coverage reports directory. */
export const COVERAGE_INDEX_FILENAME = "coverage-index.json";

/** Version of the index layout. Raised when the layout changes incompatibly. */
export const COVERAGE_INDEX_VERSION = 1;

/**
 * Path relative to `cwd`, with forward slashes.
 * @param {string} cwd
 * @param {string} file
 * @returns {string}
 */
export function toProjectPath(cwd, file) {
	return path.relative(cwd, path.resolve(cwd, file)).split(path.sep).join("/");
}

/**
 * Per-file coverage records of a blob's coverage field.
 *
 * vitest serializes an istanbul `CoverageMap` (`{ data: { [path]: FileCoverage } }`),
 * and each `FileCoverage` as `{ data: { path, fnMap, f, … } }`. Plain JSON maps
 * (`{ [path]: { path, fnMap, f } }`) are accepted too.
 *
 * @param {unknown} coverage - The coverage field of a parsed blob.
 * @returns {Array<{ path: string, fnMap: Record<string, { name: string, decl?: { start?: { line?: number } }, loc?: { start?: { line?: number } } }>, f: Record<string, number> }>}
 */
export function fileCoverages(coverage) {
	if (!coverage || typeof coverage !== "object") return [];
	/** @type {any} */
	const cov = coverage;
	const map = cov.data && typeof cov.data === "object" ? cov.data : cov;
	const out = [];
	for (const [key, value] of Object.entries(map)) {
		const fc = value?.data && typeof value.data === "object" && value.data.fnMap ? value.data : value;
		if (!fc || typeof fc !== "object" || !fc.fnMap || typeof fc.fnMap !== "object") continue;
		out.push({ path: typeof fc.path === "string" ? fc.path : key, fnMap: fc.fnMap, f: fc.f && typeof fc.f === "object" ? fc.f : {} });
	}
	return out;
}

/**
 * Index keys for a file's functions, in `fnMap` order.
 *
 * Each function is keyed by its name; when a name occurs more than once in the
 * file, every occurrence is keyed `name@<line>` instead (line of the declaration).
 *
 * @param {Record<string, { name: string, decl?: { start?: { line?: number } }, loc?: { start?: { line?: number } } }>} fnMap
 * @returns {Array<[string, string]>} `[fnMap id, key]` pairs.
 */
export function functionKeys(fnMap) {
	const entries = Object.entries(fnMap);
	const counts = new Map();
	for (const [, fn] of entries) counts.set(fn.name, (counts.get(fn.name) ?? 0) + 1);
	return entries.map(([id, fn]) => {
		if (counts.get(fn.name) === 1) return [id, fn.name];
		const line = fn.decl?.start?.line ?? fn.loc?.start?.line ?? id;
		return [id, `${fn.name}@${line}`];
	});
}

/**
 * Builds the index from blobs added one at a time, so only one parsed blob is
 * held in memory at once.
 */
export class CoverageIndexBuilder {
	/** @type {Map<string, Map<string, Set<string>>>} */
	#files = new Map();
	#cwd;

	/** @param {string} cwd - Project root that paths are made relative to. */
	constructor(cwd) {
		this.#cwd = cwd;
	}

	/**
	 * Add one test file's coverage.
	 * @param {string} testFile - The test file the blob was produced by.
	 * @param {unknown} coverage - The coverage field of its blob.
	 * @returns {void}
	 */
	add(testFile, coverage) {
		const test = toProjectPath(this.#cwd, testFile);
		for (const fc of fileCoverages(coverage)) {
			const source = toProjectPath(this.#cwd, fc.path);
			let functions = this.#files.get(source);
			if (!functions) {
				functions = new Map();
				this.#files.set(source, functions);
			}
			for (const [id, key] of functionKeys(fc.fnMap)) {
				let tests = functions.get(key);
				if (!tests) {
					tests = new Set();
					functions.set(key, tests);
				}
				if (Number(fc.f[id]) > 0) tests.add(test);
			}
		}
	}

	/**
	 * The index, with source files sorted and each function's test files sorted.
	 * @param {string|null} commit
	 * @returns {{ version: number, commit: string|null, files: Record<string, Record<string, string[]>> }}
	 */
	toJSON(commit) {
		/** @type {Record<string, Record<string, string[]>>} */
		const files = {};
		for (const source of [...this.#files.keys()].sort()) {
			/** @type {Record<string, string[]>} */
			const functions = {};
			for (const [key, tests] of /** @type {Map<string, Set<string>>} */ (this.#files.get(source))) functions[key] = [...tests].sort();
			files[source] = functions;
		}
		return { version: COVERAGE_INDEX_VERSION, commit, files };
	}
}

/**
 * The commit being measured: `git rev-parse HEAD` in `cwd`, else `GITHUB_SHA`, else `null`.
 * @param {string} cwd
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @returns {Promise<string|null>}
 */
export function resolveCommit(cwd, env = process.env) {
	return new Promise((resolve) => {
		execFile("git", ["rev-parse", "HEAD"], { cwd, timeout: 10_000 }, (err, stdout) => {
			const sha = String(stdout).trim();
			if (!err && /^[0-9a-f]{40,64}$/i.test(sha)) resolve(sha);
			else resolve(env.GITHUB_SHA?.trim() || null);
		});
	});
}

/**
 * Read the blobs and write the coverage index.
 *
 * @param {Object} opts
 * @param {Array<{ blob: string, testFile: string }>} opts.entries - Each blob with the test file that produced it. Missing blobs are skipped.
 * @param {string} opts.cwd - Project root.
 * @param {string} opts.outputDir - Coverage reports directory; created when missing.
 * @param {{ parse: Function }} opts.flatted - vitest's `flatted`, to read the blobs.
 * @param {string|null} [opts.commit] - Commit sha; resolved with {@link resolveCommit} when omitted.
 * @returns {Promise<{ path: string, files: number, testFiles: number }>}
 */
export async function writeCoverageIndex({ entries, cwd, outputDir, flatted, commit }) {
	const builder = new CoverageIndexBuilder(cwd);
	let testFiles = 0;
	for (const { blob, testFile } of entries) {
		let text;
		try {
			text = await fs.readFile(blob, "utf-8");
		} catch {
			continue; // no blob for this file (it crashed before the reporter wrote one)
		}
		const parsed = flatted.parse(text);
		if (!Array.isArray(parsed)) throw new Error(`${path.basename(blob)} is not a vitest blob`);
		builder.add(testFile, parsed[3]);
		testFiles++;
	}
	const index = builder.toJSON(commit === undefined ? await resolveCommit(cwd) : commit);
	await fs.mkdir(outputDir, { recursive: true });
	const outPath = path.join(outputDir, COVERAGE_INDEX_FILENAME);
	await fs.writeFile(outPath, `${JSON.stringify(index, null, "\t")}\n`, "utf-8");
	return { path: outPath, files: Object.keys(index.files).length, testFiles };
}
