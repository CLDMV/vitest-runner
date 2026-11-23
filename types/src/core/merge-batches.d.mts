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
export function resolveMergeBatchSize(value: number | string | undefined, env?: NodeJS.ProcessEnv): number;
/**
 * Find the installed vitest package (directory + version) that owns `vitestBin`.
 *
 * @param {string} vitestBin - Absolute path to the vitest binary.
 * @returns {{ dir: string, version: string } | null} `null` when no vitest package.json is found above the binary.
 */
export function findVitestPackage(vitestBin: string): {
    dir: string;
    version: string;
} | null;
/**
 * Whether the batched merge supports this vitest version.
 *
 * @param {string} version - Installed vitest version.
 * @returns {boolean}
 */
export function isSupportedVitestVersion(version: string): boolean;
/**
 * Load `flatted` and `@vitest/istanbul-lib-coverage` from the installed vitest's
 * own dependencies, so the reducer reads and writes blobs with the same code vitest uses.
 *
 * @param {string} vitestDir - The vitest package directory (see {@link findVitestPackage}).
 * @returns {Promise<{ flatted: { parse: Function, stringify: Function }, libCoverage: { createCoverageMap: Function } }>}
 */
export function loadBlobLibraries(vitestDir: string): Promise<{
    flatted: {
        parse: Function;
        stringify: Function;
    };
    libCoverage: {
        createCoverageMap: Function;
    };
}>;
/**
 * Check that a parsed blob has vitest 5's layout.
 *
 * @param {unknown} blob - The `flatted.parse` result of one blob file.
 * @param {string} expectedVersion - Installed vitest version.
 * @param {string} file - Blob path, for the error message.
 * @returns {void}
 * @throws {UnsupportedBlobError}
 */
export function assertBlobShape(blob: unknown, expectedVersion: string, file: string): void;
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
export function reduceBlobFiles({ inputs, output, expectedVersion, flatted, libCoverage }: {
    inputs: string[];
    output: string;
    expectedVersion: string;
    flatted: {
        parse: Function;
        stringify: Function;
    };
    libCoverage: {
        createCoverageMap: Function;
    };
}): Promise<void>;
/**
 * Split `items` into consecutive groups of at most `size`.
 * @template T
 * @param {T[]} items
 * @param {number} size
 * @returns {T[][]}
 */
export function chunk<T>(items: T[], size: number): T[][];
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
export function reduceBlobsInBatches(opts: {
    blobFiles: string[];
    scratchDir: string;
    batchSize: number;
    vitestDir: string;
    vitestVersion: string;
    cwd: string;
    maxOldSpaceMb: number | undefined;
    nodeEnv?: string;
    log?: (msg: string) => void;
    helperPath?: string;
}): Promise<{
    ok: boolean;
    dir?: string;
    rounds?: number;
    count?: number;
    unsupported?: boolean;
    message?: string;
}>;
/** Blob count above which blobs are reduced in batches before the final merge. */
export const DEFAULT_MERGE_BATCH_SIZE: 50;
/** Env var that overrides the default batch size (an explicit option wins). */
export const MERGE_BATCH_SIZE_ENV: "VITEST_MERGE_BATCH_SIZE";
/** Vitest majors whose blob layout the reducer was verified against. */
export const SUPPORTED_VITEST_MAJORS: readonly number[];
/** Exit code the helper uses when a blob doesn't have the expected layout. */
export const UNSUPPORTED_EXIT_CODE: 3;
/** Thrown when a blob doesn't have the layout the reducer was written for. */
export class UnsupportedBlobError extends Error {
}
/**
 * Accumulates the serialized module graphs of several blobs into one, keeping
 * each module once (by module id) and the union of its imports.
 */
export class EnvironmentModulesAccumulator {
    /**
     * Add one blob's `environmentModules`.
     * @param {Record<string, { environments: Record<string, { idTable: string[], modules: [number, number, number, number[]][] }>, external: [string, unknown][] }>} environmentModules
     * @returns {void}
     */
    add(environmentModules: Record<string, {
        environments: Record<string, {
            idTable: string[];
            modules: [number, number, number, number[]][];
        }>;
        external: [string, unknown][];
    }>): void;
    /**
     * Serialize back to the layout vitest's blob reporter writes.
     * @returns {Record<string, { environments: Record<string, { idTable: string[], modules: [number, number, number, number[]][] }>, external: [string, unknown][] }>}
     */
    toJSON(): Record<string, {
        environments: Record<string, {
            idTable: string[];
            modules: [number, number, number, number[]][];
        }>;
        external: [string, unknown][];
    }>;
    #private;
}
