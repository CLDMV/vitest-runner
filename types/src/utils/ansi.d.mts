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
export function stripAnsi(text: string): string;
/**
 * Check whether a coverage percentage is a real number.
 *
 * Istanbul reports a metric's `pct` as the string `"Unknown"` when nothing was
 * measured (e.g. the coverage `include` matched no files), so a `pct` cannot be
 * assumed to be numeric.
 * @param {unknown} pct - Coverage percentage as read from a coverage summary.
 * @returns {pct is number} `true` when `pct` is a finite number.
 * @example
 * isKnownPct(75.5); // true
 * isKnownPct("Unknown"); // false
 */
export function isKnownPct(pct: unknown): pct is number;
/**
 * Format a coverage percentage with a fixed number of decimals, or `Unknown`
 * when the value is not a number.
 * @param {unknown} pct - Coverage percentage as read from a coverage summary.
 * @param {number} digits - Decimal places for a numeric value.
 * @returns {string} The formatted percentage (without a `%` sign).
 * @example
 * formatPct(75.5, 0); // '76'
 * formatPct("Unknown", 0); // 'Unknown'
 */
export function formatPct(pct: unknown, digits: number): string;
/**
 * Colour-code a coverage percentage value using chalk.
 * ≥ 80 % → green, ≥ 50 % → yellow, < 50 % → red. A non-numeric value
 * (istanbul's `"Unknown"`) is rendered as a dim `Unknown`.
 * @param {import('chalk').ChalkInstance} chalk - Chalk instance supplied by the caller.
 * @param {unknown} pct - Coverage percentage 0–100, or a non-numeric value such as `"Unknown"`.
 * @returns {string} Chalk-coloured, right-aligned percentage string.
 * @example
 * colourPct(chalk, 75.5); // yellow '  75.50'
 * colourPct(chalk, "Unknown"); // dim 'Unknown'
 */
export function colourPct(chalk: import("chalk").ChalkInstance, pct: unknown): string;
