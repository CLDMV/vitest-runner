/**
 * @fileoverview NODE_OPTIONS / environment helpers.
 * @module vitest-runner/src/utils/env
 */

/**
 * Build a `NODE_OPTIONS` string suitable for passing to child vitest processes.
 *
 * Merges any existing base value with optional `--max-old-space-size` and
 * `--conditions` flags.  Each flag is only added once even if called multiple
 * times with the same value.
 *
 * @param {Object} opts
 * @param {number|undefined} opts.maxOldSpaceMb - Heap ceiling to add (omit or `undefined` to skip).
 * @param {string[]} [opts.conditions=[]] - Additional `--conditions` values to append.
 * @param {string} [opts.base] - Starting `NODE_OPTIONS` string; defaults to `process.env.NODE_OPTIONS`.
 * @returns {string} Combined `NODE_OPTIONS` string (trimmed).
 * @example
 * buildNodeOptions({ maxOldSpaceMb: 4096, conditions: ['my-dev'] });
 * // '--conditions=my-dev --max-old-space-size=4096'
 */
export function buildNodeOptions({ maxOldSpaceMb, conditions = [], base = process.env.NODE_OPTIONS ?? "" }) {
	let opts = base;

	for (const cond of conditions) {
		const flag = `--conditions=${cond}`;
		if (!opts.includes(flag)) {
			opts = opts ? `${opts} ${flag}` : flag;
		}
	}

	if (maxOldSpaceMb && !opts.includes("--max-old-space-size")) {
		const flag = `--max-old-space-size=${maxOldSpaceMb}`;
		opts = opts ? `${opts} ${flag}` : flag;
	}

	return opts.trim();
}
