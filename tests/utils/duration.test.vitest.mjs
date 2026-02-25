/**
 * @fileoverview Unit tests for src/utils/duration.mjs
 */
import { describe, it, expect } from "vitest";
import { formatDuration } from "../../src/utils/duration.mjs";

describe("formatDuration", () => {
	it("formats 0 ms as 0:00", () => {
		expect(formatDuration(0)).toBe("0:00");
	});

	it("clamps negative values to 0:00", () => {
		expect(formatDuration(-5000)).toBe("0:00");
	});

	it("formats sub-second values as 0:00", () => {
		expect(formatDuration(999)).toBe("0:00");
	});

	it("formats exactly 1 second", () => {
		expect(formatDuration(1000)).toBe("0:01");
	});

	it("formats 59 seconds", () => {
		expect(formatDuration(59_000)).toBe("0:59");
	});

	it("formats exactly 1 minute", () => {
		expect(formatDuration(60_000)).toBe("1:00");
	});

	it("formats 1 minute 5 seconds (zero-pads seconds)", () => {
		expect(formatDuration(65_000)).toBe("1:05");
	});

	it("formats 59 minutes 59 seconds", () => {
		expect(formatDuration(3599_000)).toBe("59:59");
	});

	it("formats exactly 1 hour", () => {
		expect(formatDuration(3_600_000)).toBe("1:00:00");
	});

	it("formats 1 hour 1 minute 1 second (zero-pads)", () => {
		expect(formatDuration(3_661_000)).toBe("1:01:01");
	});

	it("formats 2 hours 30 minutes", () => {
		expect(formatDuration(9_000_000)).toBe("2:30:00");
	});
});
