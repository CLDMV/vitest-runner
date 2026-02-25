import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["tests/**/*.test.vitest.{js,mjs,cjs}"],
		exclude: ["tests/fixtures/**", "node_modules/**"],
		coverage: {
			provider: "v8",
			include: ["src/**"],
			exclude: [],
			reporter: ["text", "json", "json-summary"]
		},
		// Integration tests spawn child processes and can be slow
		testTimeout: 30_000
	}
});
