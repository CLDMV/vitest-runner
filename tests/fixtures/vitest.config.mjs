/**
 * Minimal Vitest config used by integration tests when spawning child vitest
 * processes against fixture test files.  Intentionally has no `exclude` so the
 * fixture files under this directory are not blocked from running.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["**/*.test.vitest.{js,mjs,cjs}"]
	}
});
