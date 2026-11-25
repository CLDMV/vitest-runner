/**
 * Path relative to `cwd`, with forward slashes.
 * @param {string} cwd
 * @param {string} file
 * @returns {string}
 */
export function toProjectPath(cwd: string, file: string): string;
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
export function fileCoverages(coverage: unknown): Array<{
    path: string;
    fnMap: Record<string, {
        name: string;
        decl?: {
            start?: {
                line?: number;
            };
        };
        loc?: {
            start?: {
                line?: number;
            };
        };
    }>;
    f: Record<string, number>;
}>;
/**
 * Index keys for a file's functions, in `fnMap` order.
 *
 * Each function is keyed by its name; when a name occurs more than once in the
 * file, every occurrence is keyed `name@<line>` instead (line of the declaration).
 *
 * @param {Record<string, { name: string, decl?: { start?: { line?: number } }, loc?: { start?: { line?: number } } }>} fnMap
 * @returns {Array<[string, string]>} `[fnMap id, key]` pairs.
 */
export function functionKeys(fnMap: Record<string, {
    name: string;
    decl?: {
        start?: {
            line?: number;
        };
    };
    loc?: {
        start?: {
            line?: number;
        };
    };
}>): Array<[string, string]>;
/**
 * The test files a blob was produced by, from its `files` field (vitest's file
 * tasks). The runner writes one test file per blob; a blob from a plain vitest
 * run can hold several, and its coverage then counts for each of them.
 * @param {unknown} files - The `files` field of a parsed blob.
 * @returns {string[]}
 */
export function blobTestFiles(files: unknown): string[];
/**
 * The commit being measured: `git rev-parse HEAD` in `cwd`, else `GITHUB_SHA`, else `null`.
 * @param {string} cwd
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @returns {Promise<string|null>}
 */
export function resolveCommit(cwd: string, env?: NodeJS.ProcessEnv): Promise<string | null>;
/**
 * Read the blobs and write the coverage index.
 *
 * @param {Object} opts
 * @param {Array<{ blob: string, testFile?: string }>} opts.entries - Each blob, with the test file that produced it when known; without one, the test files are read from the blob. Missing blobs are skipped.
 * @param {string} opts.cwd - Project root.
 * @param {string} opts.outputDir - Coverage reports directory; created when missing.
 * @param {{ parse: Function }} opts.flatted - vitest's `flatted`, to read the blobs.
 * @param {string|null} [opts.commit] - Commit sha; resolved with {@link resolveCommit} when omitted.
 * @returns {Promise<{ path: string, files: number, testFiles: number }>} `testFiles` counts distinct test files.
 */
export function writeCoverageIndex({ entries, cwd, outputDir, flatted, commit }: {
    entries: Array<{
        blob: string;
        testFile?: string;
    }>;
    cwd: string;
    outputDir: string;
    flatted: {
        parse: Function;
    };
    commit?: string | null;
}): Promise<{
    path: string;
    files: number;
    testFiles: number;
}>;
/**
 * Write the coverage index from directories of vitest blobs, for a caller that
 * runs the runner with `mergeReports: false` and merges the blobs itself.
 * Call it after the merge (the merge clears the reports directory) and before
 * the blobs are deleted. Each blob's test files are read from the blob; only
 * the files directly inside each directory are read.
 *
 * @param {Object} opts
 * @param {string|string[]} opts.blobsDir - The blobs directory, or several (relative paths resolve against `cwd`).
 * @param {string} [opts.cwd=process.cwd()] - Project root.
 * @param {string} [opts.outputDir] - Coverage reports directory; defaults to `<cwd>/coverage`.
 * @param {string} [opts.vitestBin] - The vitest binary whose `flatted` reads the blobs; defaults to the one installed for `cwd`.
 * @param {string|null} [opts.commit] - Commit sha; resolved with {@link resolveCommit} when omitted.
 * @returns {Promise<{ path: string, files: number, testFiles: number }>}
 * @example
 * await runMergeReports(".coverage-blobs", { cwd, vitestBin, extraCoverageArgs });
 * await writeCoverageIndexFromBlobs({ blobsDir: ".coverage-blobs", cwd });
 */
export function writeCoverageIndexFromBlobs({ blobsDir, cwd, outputDir, vitestBin, commit }: {
    blobsDir: string | string[];
    cwd?: string;
    outputDir?: string;
    vitestBin?: string;
    commit?: string | null;
}): Promise<{
    path: string;
    files: number;
    testFiles: number;
}>;
/** File name of the index inside the coverage reports directory. */
export const COVERAGE_INDEX_FILENAME: "coverage-index.json";
/** Version of the index layout. Raised when the layout changes incompatibly. */
export const COVERAGE_INDEX_VERSION: 1;
/**
 * Builds the index from blobs added one at a time, so only one parsed blob is
 * held in memory at once.
 */
export class CoverageIndexBuilder {
    /** @param {string} cwd - Project root that paths are made relative to. */
    constructor(cwd: string);
    /**
     * Add one blob's coverage.
     * @param {string|string[]} testFile - The test file(s) the blob was produced by.
     * @param {unknown} coverage - The coverage field of its blob.
     * @returns {void}
     */
    add(testFile: string | string[], coverage: unknown): void;
    /**
     * The index, with source files sorted and each function's test files sorted.
     * @param {string|null} commit
     * @returns {{ version: number, commit: string|null, files: Record<string, Record<string, string[]>> }}
     */
    toJSON(commit: string | null): {
        version: number;
        commit: string | null;
        files: Record<string, Record<string, string[]>>;
    };
    #private;
}
