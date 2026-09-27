/**
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/fixtures/heap-output/heap.test.vitest.mjs
 *	@Date: 2026-02-26T06:30:55-08:00 (1772116255)
 *	@Author: Shinrai <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Shinrai <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-09-27 08:51:32 -07:00 (1790524292)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 */

/**
 * Fixture file that emits a "heap used" marker in its stdout so that
 * parseVitestOutput() returns a non-null heapMb field.
 *
 * Used by integration tests to exercise the per-file heapInfo display paths
 * in runner.mjs (lines 217 and 330) without requiring a real
 * --max-old-space-size measurement from vitest.
 */
import { it, expect } from "vitest";

it("passes and emits heap marker", () => {
	// Write the heap-usage marker to stderr (always forwarded to the parent pipe)
	// so it is captured in the combined stdout+stderr string that
	// parseVitestOutput() processes.
	process.stderr.write("512 MB heap used\n");
	expect(true).toBe(true);
});
