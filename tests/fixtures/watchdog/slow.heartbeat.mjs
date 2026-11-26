/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/fixtures/watchdog/slow.heartbeat.mjs
 *	@Date: 2026-11-22T21:41:25-08:00 (1795412485)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-22T21:43:40-08:00 (1795412620)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

import { it } from "vitest";

// Passes, but takes about 3 s without printing anything, longer than the idle limit the
// heartbeat test sets. Only the heartbeat reporter's progress keeps the watchdog quiet.
for (let i = 0; i < 8; i++) {
	it(`step ${i}`, () => new Promise((resolve) => setTimeout(resolve, 400)));
}
