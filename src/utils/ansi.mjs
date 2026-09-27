/**
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /src/utils/ansi.mjs
 *	@Date: 2026-02-24T22:33:55-08:00 (1772001235)
 *	@Author: Shinrai <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Shinrai <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-09-27 08:51:31 -07:00 (1790524291)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 */

/**
 * @fileoverview ANSI escape-code helpers.
 * @module vitest-runner/src/utils/ansi
 */

/**
 * Strip ANSI colour/style escape codes from a string.
 * @param {string} text - Input text that may contain ANSI codes.
 * @returns {string} Clean text without escape codes.
 * @example
 * stripAnsi('\x1B[32mhello\x1B[0m'); // 'hello'
 */
export function stripAnsi(text) {
	// eslint-disable-next-line no-control-regex
	return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");
}

/**
 * Colour-code a coverage percentage value using chalk.
 * ≥ 80 % → green, ≥ 50 % → yellow, < 50 % → red.
 * @param {import('chalk').ChalkInstance} chalk - Chalk instance supplied by the caller.
 * @param {number} pct - Coverage percentage 0–100.
 * @returns {string} Chalk-coloured, right-aligned percentage string.
 * @example
 * colourPct(chalk, 75.5); // yellow '  75.50'
 */
export function colourPct(chalk, pct) {
	const str = pct.toFixed(2).padStart(6);
	if (pct >= 80) return chalk.green(str);
	if (pct >= 50) return chalk.yellow(str);
	return chalk.red(str);
}
