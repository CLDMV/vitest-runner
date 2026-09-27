/**
 * Fixture that writes a marker file into its VITEST_RUNNER_TMP-provided scratch
 * directory (via makeRunTmpDir), then reports that directory's path to a FIXED
 * location outside the scratch tree (vitest swallows console output from a
 * passing test by default, so a log line wouldn't reach the parent process) —
 * lets integration tests assert the scratch lifecycle end-to-end.
 */
import { it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { makeRunTmpDir } from "../../../src/core/scratch.mjs";

it("writes into its own VITEST_RUNNER_TMP scratch directory", () => {
	expect(process.env.VITEST_RUNNER_TMP).toBeTruthy();

	const dir = makeRunTmpDir("scratch-check");
	fs.writeFileSync(path.join(dir, "marker.txt"), "hello");

	const markerFile = process.env.SCRATCH_CHECK_MARKER_FILE;
	if (markerFile) fs.writeFileSync(markerFile, JSON.stringify({ dir }));

	expect(fs.existsSync(path.join(dir, "marker.txt"))).toBe(true);
});
