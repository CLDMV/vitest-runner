/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/fixtures/concurrent-runs/slow/slow.test.vitest.mjs
 *	@Date: 2026-11-21T12:10:25-08:00 (1795291825)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-21T12:10:28-08:00 (1795291828)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

import { describe, it, expect } from "vitest";
import { double } from "../src/lib.mjs";

describe("slow", () => {
	// Stays alive long enough for a second run in the same cwd to start and finish.
	it("doubles after a pause", async () => {
		await new Promise((resolve) => setTimeout(resolve, 4000));
		expect(double(2)).toBe(4);
	}, 20_000);
});
