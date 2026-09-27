import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["tests/**/*.test.vitest.{js,mjs,cjs}"],
		exclude: ["tests/fixtures/**", "node_modules/**"],
		coverage: {
			provider: "v8",
			include: ["src/**"],
			// src/bin/vitest-runner.mjs is exercised by tests/cli/bin.test.vitest.mjs, but
			// only via spawnSync into a SEPARATE node process — v8's in-process coverage
			// collector can't attribute execution across that boundary. Real coverage tool
			// gap, not untested code; excluded here rather than reported as permanently 0%.
			exclude: ["src/bin/**"],
			reporter: ["text", "json", "json-summary"]
		},
		// Integration tests spawn child processes and can be slow
		testTimeout: 30_000
	}
});
