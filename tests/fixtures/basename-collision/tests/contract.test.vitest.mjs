import { describe, it, expect } from "vitest";

describe("fixture root contract — always passes", () => {
	it("root test 1", () => {
		expect(1 + 1).toBe(2);
	});
	it("root test 2", () => {
		expect("hello").toBe("hello");
	});
});
