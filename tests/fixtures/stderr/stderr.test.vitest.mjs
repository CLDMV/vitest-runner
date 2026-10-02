/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/fixtures/stderr/stderr.test.vitest.mjs
 *	@Date: 2026-02-25T14:20:44-08:00 (1772058044)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-10-02T15:35:36-07:00 (1790980536)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

import { describe, it, expect } from "vitest";

describe("fixture — produces stderr via process.stderr.write", () => {
	it("passes while writing directly to process stderr", () => {
		// Use process.stderr.write() directly so the data goes to the child's
		// piped stderr fd (vitest intercepts console.error but not raw fd writes).
		process.stderr.write("test-stderr-marker: intentional stderr output for coverage testing\n");
		expect(1).toBe(1);
	});
});
