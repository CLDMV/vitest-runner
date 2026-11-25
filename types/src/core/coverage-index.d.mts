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
 * @param {Array<{ blob: string, testFile: string }>} opts.entries - Each blob with the test file that produced it. Missing blobs are skipped.
 * @param {string} opts.cwd - Project root.
 * @param {string} opts.outputDir - Coverage reports directory; created when missing.
 * @param {{ parse: Function }} opts.flatted - vitest's `flatted`, to read the blobs.
 * @param {string|null} [opts.commit] - Commit sha; resolved with {@link resolveCommit} when omitted.
 * @returns {Promise<{ path: string, files: number, testFiles: number }>}
 */
export function writeCoverageIndex({ entries, cwd, outputDir, flatted, commit }: {
    entries: Array<{
        blob: string;
        testFile: string;
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
     * Add one test file's coverage.
     * @param {string} testFile - The test file the blob was produced by.
     * @param {unknown} coverage - The coverage field of its blob.
     * @returns {void}
     */
    add(testFile: string, coverage: unknown): void;
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
