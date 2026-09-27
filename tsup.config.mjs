/**
 * @fileoverview Bundler config — produces dist/index.mjs + dist/index.cjs from a single
 * source entry, so the CJS build is generated automatically instead of hand-maintained.
 */
import { defineConfig } from "tsup";

export default defineConfig({
	entry: { index: "src/runner.mjs" },
	format: ["esm", "cjs"],
	outDir: "dist",
	target: "node20",
	platform: "node",
	splitting: false,
	sourcemap: false,
	dts: false,
	clean: true,
	outExtension({ format }) {
		return { js: format === "cjs" ? ".cjs" : ".mjs" };
	}
});
