/**
 * @fileoverview Unit tests for src/utils/env.mjs
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildNodeOptions } from "../../src/utils/env.mjs";

describe("buildNodeOptions", () => {
	let savedNodeOptions;

	beforeEach(() => {
		savedNodeOptions = process.env.NODE_OPTIONS;
		delete process.env.NODE_OPTIONS;
	});

	afterEach(() => {
		if (savedNodeOptions === undefined) {
			delete process.env.NODE_OPTIONS;
		} else {
			process.env.NODE_OPTIONS = savedNodeOptions;
		}
	});

	it("returns empty string when called with no meaningful options", () => {
		expect(buildNodeOptions({ base: "" })).toBe("");
	});

	it("adds --max-old-space-size when maxOldSpaceMb is given", () => {
		const result = buildNodeOptions({ maxOldSpaceMb: 4096, base: "" });
		expect(result).toBe("--max-old-space-size=4096");
	});

	it("does not add --max-old-space-size when maxOldSpaceMb is falsy", () => {
		expect(buildNodeOptions({ maxOldSpaceMb: 0, base: "" })).toBe("");
		expect(buildNodeOptions({ maxOldSpaceMb: undefined, base: "" })).toBe("");
	});

	it("does not duplicate --max-old-space-size if already in base", () => {
		const result = buildNodeOptions({
			maxOldSpaceMb: 4096,
			base: "--max-old-space-size=2048"
		});
		// Should not add a second --max-old-space-size
		expect(result.match(/--max-old-space-size/g)?.length).toBe(1);
	});

	it("adds a single --conditions flag", () => {
		const result = buildNodeOptions({ conditions: ["my-dev"], base: "" });
		expect(result).toBe("--conditions=my-dev");
	});

	it("adds multiple --conditions flags", () => {
		const result = buildNodeOptions({ conditions: ["a", "b"], base: "" });
		expect(result).toBe("--conditions=a --conditions=b");
	});

	it("does not duplicate a condition already in base", () => {
		const result = buildNodeOptions({
			conditions: ["my-dev"],
			base: "--conditions=my-dev"
		});
		expect(result.match(/--conditions=my-dev/g)?.length).toBe(1);
	});

	it("combines conditions and maxOldSpaceMb", () => {
		const result = buildNodeOptions({
			maxOldSpaceMb: 2048,
			conditions: ["custom"],
			base: ""
		});
		expect(result).toContain("--conditions=custom");
		expect(result).toContain("--max-old-space-size=2048");
	});

	it("prepends to an existing base value", () => {
		const result = buildNodeOptions({
			conditions: ["extra"],
			base: "--experimental-vm-modules"
		});
		expect(result).toContain("--experimental-vm-modules");
		expect(result).toContain("--conditions=extra");
	});

	it("reads from process.env.NODE_OPTIONS when base is not provided", () => {
		process.env.NODE_OPTIONS = "--experimental-vm-modules";
		const result = buildNodeOptions({ maxOldSpaceMb: 1024 });
		expect(result).toContain("--experimental-vm-modules");
		expect(result).toContain("--max-old-space-size=1024");
	});

	it("trims the result", () => {
		const result = buildNodeOptions({ base: "  " });
		expect(result).toBe("");
	});
});
