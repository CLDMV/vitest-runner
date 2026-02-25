/**
 * @fileoverview Duration formatting utilities.
 * @module vitest-runner/src/utils/duration
 */
/**
 * Format a millisecond duration as a human-readable `m:ss` or `h:mm:ss` string.
 * @param {number} ms - Duration in milliseconds.
 * @returns {string} Formatted duration string.
 * @example
 * formatDuration(65000);    // '1:05'
 * formatDuration(3661000);  // '1:01:01'
 */
export function formatDuration(ms: number): string;
