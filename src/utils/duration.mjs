/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /src/utils/duration.mjs
 *	@Date: 2026-02-24T22:33:55-08:00 (1772001235)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-10-02T15:35:24-07:00 (1790980524)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

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
