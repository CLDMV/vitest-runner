/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/integration/isolate.test.vitest.mjs
 *	@Date: 2026-11-21T12:13:52-08:00 (1795292032)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-21T12:14:15-08:00 (1795292055)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * The real re-exec under unshare. It only runs where unprivileged user and PID namespaces
 * work; in a container or k3s pod (already namespaced, and unshare refuses with EPERM) and on
 * hosts that restrict user namespaces it is skipped.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { assertUnshareWorks, inPidNamespace } from "../../src/core/isolate.mjs";

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/isolate/run-isolated.mjs");

const unshareWorks = (() => {
	if (process.platform !== "linux" || inPidNamespace()) return false;
	try {
		assertUnshareWorks();
		return true;
	} catch {
		return false;
	}
})();

describe.runIf(unshareWorks)("isolate (real unshare)", () => {
	it("re-runs the script in a new PID namespace and passes the exit code through", () => {
		const result = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8", env: { ...process.env, CLDMV_TEST_ISOLATE: "" } });
		const lines = result.stdout.split("\n").filter((line) => line.startsWith("namespace "));
		expect(result.status, result.stdout + result.stderr).toBe(0);
		expect(lines).toHaveLength(2);
		const [outside, inside] = lines.map((line) => line.split(" "));
		expect(inside[1]).not.toBe(outside[1]);
		// Inside its own namespace the re-run node is pid 1 (unshare -f forks it first).
		expect(inside[3]).toBe("1");
	});
});
