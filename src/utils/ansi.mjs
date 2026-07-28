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
 * Coerce a coverage percentage to a finite number, defaulting to 0 for
 * non-numeric / empty / NaN input. A malformed or empty coverage summary — e.g.
 * a coverage run against a deleted `src/` tree, which yields `pct` values that
 * aren't numbers — would otherwise reach `.toFixed()` and throw
 * `pct.toFixed is not a function`, crashing the whole run over a config problem.
 * Coercing here degrades that to a plain `0.00` instead.
 * @param {unknown} pct - Candidate percentage (number, numeric string, or junk).
 * @returns {number} A finite number, or 0 when the input can't be one.
 * @example
 * toSafePct(75.5);       // 75.5
 * toSafePct("75.5");     // 75.5
 * toSafePct(undefined);  // 0
 * toSafePct("");         // 0
 */
export function toSafePct(pct) {
	const n = typeof pct === "number" ? pct : Number(pct);
	return Number.isFinite(n) ? n : 0;
}

/**
 * Colour-code a coverage percentage value using chalk.
 * ≥ 80 % → green, ≥ 50 % → yellow, < 50 % → red.
 * Defensive: a non-numeric / empty `pct` (from a malformed or empty coverage
 * summary) is coerced to 0 rather than throwing — see {@link toSafePct}.
 * @param {import('chalk').ChalkInstance} chalk - Chalk instance supplied by the caller.
 * @param {number} pct - Coverage percentage 0–100.
 * @returns {string} Chalk-coloured, right-aligned percentage string.
 * @example
 * colourPct(chalk, 75.5); // yellow '  75.50'
 */
export function colourPct(chalk, pct) {
	const safe = toSafePct(pct);
	const str = safe.toFixed(2).padStart(6);
	if (safe >= 80) return chalk.green(str);
	if (safe >= 50) return chalk.yellow(str);
	return chalk.red(str);
}
