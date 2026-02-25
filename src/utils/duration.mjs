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
export function formatDuration(ms) {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	if (hours > 0) {
		return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
	}

	return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
