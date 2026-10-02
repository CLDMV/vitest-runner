/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/fixtures/failing/broken.test.vitest.mjs
 *	@Date: 2026-02-24T23:27:21-08:00 (1772004441)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-10-02T15:35:31-07:00 (1790980531)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

import { describe, it, expect } from "vitest";

describe("fixture — always fails", () => {
	it("fails intentionally", () => {
		expect(1).toBe(2); // deliberate failure
	});
});
