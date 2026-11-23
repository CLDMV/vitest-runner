/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/fixtures/merge-batches/src/text.mjs
 *	@Date: 2026-11-21T11:54:03-08:00 (1795290843)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-21T11:56:14-08:00 (1795290974)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

export function shout(s) {
	return `${s.toUpperCase()}!`;
}

export function initials(name) {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.map((part) => part[0].toUpperCase())
		.join("");
}

export function pad(s, width, side = "left") {
	if (side === "left") return s.padStart(width);
	return s.padEnd(width);
}
