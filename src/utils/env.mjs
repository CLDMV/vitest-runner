/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /src/utils/env.mjs
 *	@Date: 2026-02-24T22:33:55-08:00 (1772001235)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-10-26T08:18:12-07:00 (1793027892)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

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

/**
 * Build the environment object for a vitest child process (or the fs module
 * cache helper, which must resolve the config the same way).
 * @param {{ maxOldSpaceMb?: number, conditions?: string[], nodeEnv?: string, extraEnv?: NodeJS.ProcessEnv }} opts
 * @returns {NodeJS.ProcessEnv}
 */
export function buildEnv({ maxOldSpaceMb, conditions = [], nodeEnv = "development", extraEnv = {} }) {
	const env = { ...process.env };
	if (!env.NODE_ENV) env.NODE_ENV = nodeEnv;

	const nodeOptions = buildNodeOptions({ maxOldSpaceMb, conditions, base: env.NODE_OPTIONS ?? "" });
	if (nodeOptions) env.NODE_OPTIONS = nodeOptions;

	Object.assign(env, extraEnv);

	return env;
}
