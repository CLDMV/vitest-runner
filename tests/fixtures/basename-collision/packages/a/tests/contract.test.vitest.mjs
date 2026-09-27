import { describe, it, expect } from "vitest";

describe("fixture nested contract — always passes", () => {
	it("nested test 1", () => {
		expect(1 + 1).toBe(2);
	});
});
