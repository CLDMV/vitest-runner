/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/cli/args-file-timeout.test.vitest.mjs
 *	@Date: 2026-11-22T21:44:29-08:00 (1795412669)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-22T21:44:32-08:00 (1795412672)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

import { describe, it, expect } from "vitest";
import { parseArguments } from "../../src/cli/args.mjs";
import { DEFAULT_FILE_IDLE_TIMEOUT_MS, DEFAULT_FILE_TIMEOUT_MS, killChildProcessGroups, resolveFileTimeouts } from "@cldmv/vitest-runner";

describe("parseArguments — --file-timeout / --file-idle-timeout", () => {
	it("are undefined by default", () => {
		const result = parseArguments([]);
		expect(result.fileTimeout).toBeUndefined();
		expect(result.fileIdleTimeout).toBeUndefined();
	});
	it("read the spaced form in seconds and stay out of the vitest passthrough", () => {
		const result = parseArguments(["--file-timeout", "900", "--file-idle-timeout", "0", "--reporter=dot"]);
		expect(result.fileTimeout).toBe(900);
		expect(result.fileIdleTimeout).toBe(0);
		expect(result.vitestPassthroughArgs).toEqual(["--reporter=dot"]);
		expect(result.testPatterns).toEqual([]);
	});
	it("read the = form, including fractions", () => {
		const result = parseArguments(["--file-timeout=1.5", "--file-idle-timeout=120"]);
		expect(result.fileTimeout).toBe(1.5);
		expect(result.fileIdleTimeout).toBe(120);
	});
});

describe("package exports", () => {
	it("exports the watchdog defaults, resolver and group kill", () => {
		expect(DEFAULT_FILE_TIMEOUT_MS).toBe(1_800_000);
		expect(DEFAULT_FILE_IDLE_TIMEOUT_MS).toBe(600_000);
		expect(resolveFileTimeouts({ timeoutMs: 1 }, {}).timeoutMs).toBe(1);
		expect(typeof killChildProcessGroups).toBe("function");
	});
});
