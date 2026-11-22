/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/fixtures/isolate/run-isolated.mjs
 *	@Date: 2026-11-21T12:13:52-08:00 (1795292032)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-21T16:59:14-08:00 (1795309154)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

// Runs the passing fixtures with isolation on and prints the PID namespace it ran in, once
// outside (before the re-exec) and once inside. Exit code = run()'s. Pass `force` to force it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "../../../src/index.mjs";

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
console.log(`namespace ${fs.readlinkSync("/proc/self/ns/pid")} pid ${process.pid}`);
const code = await run({
	cwd: path.resolve(fixtures, "../.."),
	testDir: path.join(fixtures, "passing"),
	vitestConfig: path.join(fixtures, "vitest.config.mjs"),
	isolate: process.argv[2] === "force" ? "force" : true,
	// No coverage: it would share <cwd>/.vitest-coverage-tmp with the coverage tests in run.test.
	coverageQuiet: false,
	suppressFileOutput: true,
	scratchDir: "tmp/isolate-e2e"
});
process.exit(code);
