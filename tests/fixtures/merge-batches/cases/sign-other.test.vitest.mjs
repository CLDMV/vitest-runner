/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/fixtures/merge-batches/cases/sign-other.test.vitest.mjs
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

import { describe, it, expect } from "vitest";
import { sign, clamp } from "../src/calc.mjs";

describe("sign + clamp", () => {
	it("negative", () => expect(sign(-1)).toBe("negative"));
	it("clamps low", () => expect(clamp(-5, 0, 10)).toBe(0));
});
