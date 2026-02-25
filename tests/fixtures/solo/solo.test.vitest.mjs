import { describe, it, expect } from "vitest";

describe("fixture — solo run", () => {
	it("runs solo, still passes", () => {
		expect(42).toBe(42);
	});
});
