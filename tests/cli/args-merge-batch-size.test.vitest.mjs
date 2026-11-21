/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/cli/args-merge-batch-size.test.vitest.mjs
 *	@Date: 2026-11-21T11:56:06-08:00 (1795290966)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-21T11:56:12-08:00 (1795290972)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * @fileoverview parseArguments() handling of --merge-batch-size.
 */
import { describe, it, expect } from "vitest";
import { parseArguments } from "../../src/cli/args.mjs";
import { DEFAULT_MERGE_BATCH_SIZE, resolveMergeBatchSize } from "@cldmv/vitest-runner";

describe("parseArguments — --merge-batch-size", () => {
	it("is undefined by default", () => {
		expect(parseArguments([]).mergeBatchSize).toBeUndefined();
	});
	it("reads the spaced form and keeps it out of the vitest passthrough", () => {
		const result = parseArguments(["--merge-batch-size", "10", "--reporter=dot"]);
		expect(result.mergeBatchSize).toBe(10);
		expect(result.vitestPassthroughArgs).toEqual(["--reporter=dot"]);
		expect(result.testPatterns).toEqual([]);
	});
	it("reads the = form, including 0", () => {
		expect(parseArguments(["--merge-batch-size=0"]).mergeBatchSize).toBe(0);
	});
});

describe("package exports", () => {
	it("exports the default batch size and resolver", () => {
		expect(DEFAULT_MERGE_BATCH_SIZE).toBe(50);
		expect(resolveMergeBatchSize(3, {})).toBe(3);
	});
});
