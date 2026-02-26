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
