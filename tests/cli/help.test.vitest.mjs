/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/cli/help.test.vitest.mjs
 *	@Date: 2026-02-24T23:27:21-08:00 (1772004441)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-10-02T15:35:26-07:00 (1790980526)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * @fileoverview Unit tests for src/cli/help.mjs
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { showHelp } from "../../src/cli/help.mjs";

describe("showHelp", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("logs output to console.log", () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		showHelp();
		expect(spy).toHaveBeenCalledOnce();
	});

	it("output contains the binary name", () => {
		let output = "";
		vi.spyOn(console, "log").mockImplementation((msg) => {
			output = String(msg);
		});
		showHelp();
		expect(output).toContain("vitest-runner");
	});

	it("output contains --help flag description", () => {
		let output = "";
		vi.spyOn(console, "log").mockImplementation((msg) => {
			output = String(msg);
		});
		showHelp();
		expect(output).toContain("--help");
	});

	it("output contains --workers flag description", () => {
		let output = "";
		vi.spyOn(console, "log").mockImplementation((msg) => {
			output = String(msg);
		});
		showHelp();
		expect(output).toContain("--workers");
	});

	it("output contains --coverage-quiet flag description", () => {
		let output = "";
		vi.spyOn(console, "log").mockImplementation((msg) => {
			output = String(msg);
		});
		showHelp();
		expect(output).toContain("--coverage-quiet");
	});

	it("output contains --suppress-file-output flag description", () => {
		let output = "";
		vi.spyOn(console, "log").mockImplementation((msg) => {
			output = String(msg);
		});
		showHelp();
		expect(output).toContain("--suppress-file-output");
	});

	it("output contains --json flag description", () => {
		let output = "";
		vi.spyOn(console, "log").mockImplementation((msg) => {
			output = String(msg);
		});
		showHelp();
		expect(output).toContain("--json");
	});

	it("output contains --no-top-summary flag description", () => {
		let output = "";
		vi.spyOn(console, "log").mockImplementation((msg) => {
			output = String(msg);
		});
		showHelp();
		expect(output).toContain("--no-top-summary");
	});

	it("output contains --keep-tmp flag description", () => {
		let output = "";
		vi.spyOn(console, "log").mockImplementation((msg) => {
			output = String(msg);
		});
		showHelp();
		expect(output).toContain("--keep-tmp");
	});

	it("output contains --scratch-dir flag description", () => {
		let output = "";
		vi.spyOn(console, "log").mockImplementation((msg) => {
			output = String(msg);
		});
		showHelp();
		expect(output).toContain("--scratch-dir");
	});
});
