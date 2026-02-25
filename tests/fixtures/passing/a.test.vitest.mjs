import { describe, it, expect } from "vitest";

describe("fixture a — always passes", () => {
	it("1 + 1 = 2", () => {
		expect(1 + 1).toBe(2);
	});
	it("string equality", () => {
		expect("hello").toBe("hello");
	});
});
