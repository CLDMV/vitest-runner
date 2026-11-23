/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/fixtures/merge-batches/src/calc.mjs
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

export function add(a, b) {
	return a + b;
}

export function sign(x) {
	if (x > 0) return "positive";
	if (x < 0) return "negative";
	return "zero";
}

export function clamp(x, lo, hi) {
	return x < lo ? lo : x > hi ? hi : x;
}
