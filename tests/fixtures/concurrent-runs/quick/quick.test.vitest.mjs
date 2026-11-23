/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/fixtures/concurrent-runs/quick/quick.test.vitest.mjs
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
import { half } from "../src/lib.mjs";

describe("quick", () => {
	it("halves", () => expect(half(4)).toBe(2));
});
