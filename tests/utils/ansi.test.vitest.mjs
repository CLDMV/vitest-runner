/**
 * @fileoverview Unit tests for src/utils/ansi.mjs
 */
import { describe, it, expect } from "vitest";
import { stripAnsi, colourPct, toSafePct } from "../../src/utils/ansi.mjs";

/** Minimal chalk stub: green/yellow/red just return the string unchanged */
const chalk = {
	green: (s) => `\x1B[32m${s}\x1B[0m`,
	yellow: (s) => `\x1B[33m${s}\x1B[0m`,
	red: (s) => `\x1B[31m${s}\x1B[0m`
};

describe("stripAnsi", () => {
	it("returns an empty string unchanged", () => {
		expect(stripAnsi("")).toBe("");
	});

	it("returns plain text unchanged", () => {
		expect(stripAnsi("hello world")).toBe("hello world");
	});

	it("strips a single colour code", () => {
		expect(stripAnsi("\x1B[32mhello\x1B[0m")).toBe("hello");
	});

	it("strips multiple colour codes", () => {
		expect(stripAnsi("\x1B[1m\x1B[31mERROR\x1B[0m: bad")).toBe("ERROR: bad");
	});

	it("strips codes with multiple parameters (e.g. 256-colour)", () => {
		expect(stripAnsi("\x1B[38;5;200mtext\x1B[0m")).toBe("text");
	});

	it("leaves a string that is only codes as empty", () => {
		expect(stripAnsi("\x1B[0m\x1B[32m")).toBe("");
	});
});

describe("colourPct", () => {
	it("returns red for values below 50", () => {
		const result = stripAnsi(colourPct(chalk, 0));
		expect(result).toBe("  0.00");
	});

	it("returns red for exactly 49.99", () => {
		const result = colourPct(chalk, 49.99);
		expect(result).toContain("\x1B[31m"); // red
	});

	it("returns yellow for exactly 50", () => {
		const result = colourPct(chalk, 50);
		expect(result).toContain("\x1B[33m"); // yellow
	});

	it("returns yellow for values between 50 and 79.99", () => {
		const result = colourPct(chalk, 75);
		expect(result).toContain("\x1B[33m"); // yellow
	});

	it("returns green for exactly 80", () => {
		const result = colourPct(chalk, 80);
		expect(result).toContain("\x1B[32m"); // green
	});

	it("returns green for 100", () => {
		const result = colourPct(chalk, 100);
		expect(result).toContain("\x1B[32m"); // green
	});

	it("pads the number to 6 characters", () => {
		const result = stripAnsi(colourPct(chalk, 5));
		expect(result.length).toBe(6);
		expect(result.trimStart()).toBe("5.00");
	});

	// Regression: a malformed/empty coverage summary (e.g. coverage run against a
	// deleted src/ tree) surfaces a non-numeric pct. This used to throw
	// `pct.toFixed is not a function` and crash the whole run.
	it("does not throw on a non-numeric pct — coerces undefined to 0.00", () => {
		expect(() => colourPct(chalk, undefined)).not.toThrow();
		expect(stripAnsi(colourPct(chalk, undefined))).toBe("  0.00");
	});

	it("does not throw on an empty-string pct — coerces to 0.00 (red)", () => {
		expect(() => colourPct(chalk, "")).not.toThrow();
		expect(stripAnsi(colourPct(chalk, ""))).toBe("  0.00");
		expect(colourPct(chalk, "")).toContain("\x1B[31m"); // red
	});

	it("accepts a numeric string and colours by its value", () => {
		expect(stripAnsi(colourPct(chalk, "75.5"))).toBe(" 75.50");
		expect(colourPct(chalk, "75.5")).toContain("\x1B[33m"); // yellow
	});
});

describe("toSafePct", () => {
	it("passes finite numbers through unchanged", () => {
		expect(toSafePct(0)).toBe(0);
		expect(toSafePct(75.5)).toBe(75.5);
		expect(toSafePct(100)).toBe(100);
	});

	it("parses numeric strings", () => {
		expect(toSafePct("75.5")).toBe(75.5);
		expect(toSafePct("0")).toBe(0);
	});

	it("defaults non-numeric / empty / NaN / Infinity input to 0", () => {
		expect(toSafePct(undefined)).toBe(0);
		expect(toSafePct(null)).toBe(0);
		expect(toSafePct("")).toBe(0);
		expect(toSafePct("n/a")).toBe(0);
		expect(toSafePct(NaN)).toBe(0);
		expect(toSafePct(Infinity)).toBe(0);
		expect(toSafePct({})).toBe(0);
	});
});
