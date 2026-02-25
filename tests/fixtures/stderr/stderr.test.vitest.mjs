import { describe, it, expect } from "vitest";

describe("fixture — produces stderr via process.stderr.write", () => {
	it("passes while writing directly to process stderr", () => {
		// Use process.stderr.write() directly so the data goes to the child's
		// piped stderr fd (vitest intercepts console.error but not raw fd writes).
		process.stderr.write("test-stderr-marker: intentional stderr output for coverage testing\n");
		expect(1).toBe(1);
	});
});
