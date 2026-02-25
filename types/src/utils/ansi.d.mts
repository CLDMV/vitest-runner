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
 * Colour-code a coverage percentage value using chalk.
 * ≥ 80 % → green, ≥ 50 % → yellow, < 50 % → red.
 * @param {import('chalk').ChalkInstance} chalk - Chalk instance supplied by the caller.
 * @param {number} pct - Coverage percentage 0–100.
 * @returns {string} Chalk-coloured, right-aligned percentage string.
 * @example
 * colourPct(chalk, 75.5); // yellow '  75.50'
 */
export function colourPct(chalk: import("chalk").ChalkInstance, pct: number): string;
