/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/utils/ansi.test.vitest.mjs
 *	@Date: 2026-02-24T23:27:21-08:00 (1772004441)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-10-02T15:35:38-07:00 (1790980538)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * @fileoverview Unit tests for src/utils/ansi.mjs
 */
import { describe, it, expect } from "vitest";
import { stripAnsi, colourPct, formatPct, isKnownPct } from "../../src/utils/ansi.mjs";

/** Minimal chalk stub: green/yellow/red just return the string unchanged */
const chalk = {
	green: (s) => `\x1B[32m${s}\x1B[0m`,
	yellow: (s) => `\x1B[33m${s}\x1B[0m`,
	red: (s) => `\x1B[31m${s}\x1B[0m`,
	dim: (s) => `\x1B[2m${s}\x1B[22m`
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
});

// Istanbul reports a metric's pct as the string "Unknown" when 0 files were measured.
describe("colourPct — non-numeric percentages", () => {
	it("renders istanbul's 'Unknown' as a dim 'Unknown' instead of throwing", () => {
		const result = colourPct(chalk, "Unknown");
		expect(result).toContain("\x1B[2m"); // dim
		expect(stripAnsi(result)).toBe("Unknown");
	});

	it.each([[null], [undefined], [NaN], [Infinity], ["85"]])("renders %s as 'Unknown'", (value) => {
		expect(stripAnsi(colourPct(chalk, value))).toBe("Unknown");
	});
});

describe("isKnownPct", () => {
	it("is true for finite numbers", () => {
		expect(isKnownPct(0)).toBe(true);
		expect(isKnownPct(75.5)).toBe(true);
		expect(isKnownPct(100)).toBe(true);
	});

	it.each([["Unknown"], ["85"], [null], [undefined], [NaN], [Infinity]])("is false for %s", (value) => {
		expect(isKnownPct(value)).toBe(false);
	});
});

describe("formatPct", () => {
	it("formats a number with the requested decimals", () => {
		expect(formatPct(75.5, 0)).toBe("76");
		expect(formatPct(75.5, 2)).toBe("75.50");
	});

	it("returns 'Unknown' for a non-numeric value", () => {
		expect(formatPct("Unknown", 0)).toBe("Unknown");
		expect(formatPct(undefined, 2)).toBe("Unknown");
	});
});
