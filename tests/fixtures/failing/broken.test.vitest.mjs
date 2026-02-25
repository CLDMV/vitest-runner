import { describe, it, expect } from "vitest";

describe("fixture — always fails", () => {
	it("fails intentionally", () => {
		expect(1).toBe(2); // deliberate failure
	});
});
