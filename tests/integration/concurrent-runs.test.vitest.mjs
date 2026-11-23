/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/integration/concurrent-runs.test.vitest.mjs
 *	@Date: 2026-11-21T12:10:25-08:00 (1795291825)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-21T12:10:29-08:00 (1795291829)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * @fileoverview Two coverage run() calls in the same cwd at the same time must not
 * touch each other's per-file coverage temp folders.
 *
 * Run A runs a test that sleeps for 4 s; run B starts 1 s later in the same cwd, runs
 * a quick test and finishes while A's child is still running. When the coverage temp
 * folder was shared (`<cwd>/.vitest-coverage-tmp`), B's start/finish cleanup removed
 * the folder A's child writes its coverage into, and A failed with vitest's "Something
 * removed the coverage directory" error.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "@cldmv/vitest-runner";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "../..");
const FIXTURE = path.join(PKG_ROOT, "tests", "fixtures", "concurrent-runs");
const WORK = path.join(PKG_ROOT, "tmp", `concurrent-runs-tests-${process.pid}`);

/**
 * @param {string} name
 * @param {string} dir - Fixture subfolder with the test file.
 */
const coverageRun = (name, dir) =>
	run({
		cwd: FIXTURE,
		testDir: path.join(FIXTURE, dir),
		vitestConfig: path.join(FIXTURE, "vitest.config.mjs"),
		vitestArgs: ["--coverage", `--coverage.reportsDirectory=${path.join(WORK, name, "coverage")}`],
		blobsDir: path.join(WORK, name, "blobs"),
		// Same scratch base for both, as two runs with the default scratchDir would have.
		scratchDir: path.join(WORK, "scratch"),
		fsModuleCachePath: false,
		json: true,
		workers: 1
	});

beforeAll(async () => {
	await fs.rm(WORK, { recursive: true, force: true });
	await fs.mkdir(WORK, { recursive: true });
});

afterAll(async () => {
	await fs.rm(WORK, { recursive: true, force: true });
});

describe("run() — concurrent coverage runs in one cwd", () => {
	it("keeps each run's coverage temp folder separate, so both runs succeed", async () => {
		const slow = coverageRun("slow", "slow");
		await new Promise((resolve) => setTimeout(resolve, 1000));
		const quick = await coverageRun("quick", "quick");
		const slowReport = await slow;

		expect(quick.exitCode).toBe(0);
		expect(slowReport.results.all[0].rawOutput).not.toContain("Something removed the coverage directory");
		expect(slowReport.exitCode).toBe(0);
		expect(slowReport.merge.exitCode).toBe(0);
		for (const name of ["slow", "quick"]) {
			const summary = JSON.parse(await fs.readFile(path.join(WORK, name, "coverage", "coverage-summary.json"), "utf-8"));
			expect(summary.total.statements.covered).toBeGreaterThan(0);
		}

		// No shared temp folder is created in the cwd any more.
		await expect(fs.access(path.join(FIXTURE, ".vitest-coverage-tmp"))).rejects.toThrow();
	}, 60_000);
});
