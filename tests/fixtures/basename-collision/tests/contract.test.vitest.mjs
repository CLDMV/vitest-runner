/**
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/fixtures/basename-collision/tests/contract.test.vitest.mjs
 *	@Date: 2026-09-27T01:22:08-07:00 (1790497328)
 *	@Author: Shinrai <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Shinrai <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-09-27 08:51:32 -07:00 (1790524292)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 */

import { describe, it, expect } from "vitest";

describe("fixture root contract — always passes", () => {
	it("root test 1", () => {
		expect(1 + 1).toBe(2);
	});
	it("root test 2", () => {
		expect("hello").toBe("hello");
	});
});
