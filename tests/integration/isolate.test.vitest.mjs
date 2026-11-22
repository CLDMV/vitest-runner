/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/integration/isolate.test.vitest.mjs
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

/**
 * The real re-exec under unshare. It only runs where unprivileged user and PID namespaces
 * work, so it's skipped in a container or k3s pod where unshare refuses with EPERM and on hosts
 * that restrict user namespaces. The plain mode also needs the initial PID namespace; the
 * forced mode runs in any namespace that allows unshare.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { assertUnshareWorks, inPidNamespace } from "../../src/core/isolate.mjs";

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/isolate/run-isolated.mjs");

// Whether unshare can create the namespaces here, namespaced or not (a pod type that allows it).
const unshareWorks = (() => {
	if (process.platform !== "linux") return false;
	try {
		assertUnshareWorks();
		return true;
	} catch {
		return false;
	}
})();

/**
 * Runs the fixture and returns the two `namespace` lines it printed, split into fields.
 *
 * @param {string[]} args
 * @returns {string[][]}
 */
function runFixture(args) {
	const env = { ...process.env, CLDMV_TEST_ISOLATE: "" };
	delete env.VITEST_RUNNER_ISOLATED;
	const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", env });
	const lines = result.stdout.split("\n").filter((line) => line.startsWith("namespace "));
	expect(result.status, result.stdout + result.stderr).toBe(0);
	expect(lines).toHaveLength(2);
	return lines.map((line) => line.split(" "));
}

describe.runIf(unshareWorks && !inPidNamespace())("isolate (real unshare)", () => {
	it("re-runs the script in a new PID namespace and passes the exit code through", () => {
		const [outside, inside] = runFixture([]);
		expect(inside[1]).not.toBe(outside[1]);
		// Inside its own namespace the re-run node is pid 1 (unshare -f forks it first).
		expect(inside[3]).toBe("1");
	});
});

describe.runIf(unshareWorks)("isolate=force (real unshare)", () => {
	it("re-runs in a new PID namespace even when already in one, exactly once", () => {
		const [outside, inside] = runFixture(["force"]);
		expect(inside[1]).not.toBe(outside[1]);
		expect(inside[3]).toBe("1");
	});
});
