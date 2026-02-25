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
});
