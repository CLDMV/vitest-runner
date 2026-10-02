/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tsup.config.mjs
 *	@Date: 2026-09-27T02:14:38-07:00 (1790500478)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-10-02T15:35:40-07:00 (1790980540)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * @fileoverview Bundler config — produces the published dist/ output from source.
 *
 * Two entries, two different jobs:
 *  - `index`  → dist/index.mjs (real esbuild bundle) + dist/index.cjs (a thin, hand-written
 *    shim — see src/cjs-shim.cjs — copied in verbatim by onSuccess below, never bundled by
 *    esbuild). Node's `require()` can load an ES module synchronously and read its exports
 *    directly as long as the module has no top-level await, which src/runner.mjs doesn't —
 *    so the shim can just `require("./index.mjs")` instead of esbuild compiling a second,
 *    independent copy of the whole module for the CJS format. Matches @cldmv/uuid's
 *    index.cjs pattern.
 *  - `cli`    → bin/vitest-runner.mjs — the CLI binary, ESM only, bundled from
 *    src/bin/vitest-runner.mjs (with its src/cli/* + runner.mjs dependencies inlined).
 *    bin/ is the STABLE PUBLISHED PATH (package.json "bin" never changes) but is a
 *    build artifact like dist/ — not tracked in git, overwritten on every build.
 *    src/ is not shipped, so without bundling, the source file's relative imports into
 *    src/cli/* would be missing entirely from an installed package. esbuild preserves
 *    the entry file's shebang line automatically, so the output stays directly executable.
 *
 * Sourcemaps ARE generated (useful for local debugging) but excluded from the published
 * tarball via package.json's `files` negation entry; npm pack/publish runs prepack
 * (npm run build) fresh regardless.
 *
 * No code-splitting: each entry is one self-contained file, never a set of shared chunks.
 */
import { copyFileSync } from "node:fs";
import { defineConfig } from "tsup";

const shared = {
	outDir: "dist",
	target: "node20",
	platform: "node",
	splitting: false,
	sourcemap: true,
	dts: false,
	minify: true
};

export default defineConfig([
	{
		...shared,
		entry: { index: "src/runner.mjs" },
		format: ["esm"],
		clean: true,
		outExtension() {
			return { js: ".mjs" };
		},
		onSuccess() {
			copyFileSync("src/cjs-shim.cjs", "dist/index.cjs");
		}
	},
	{
		...shared,
		entry: { "vitest-runner": "src/bin/vitest-runner.mjs" },
		format: ["esm"],
		outDir: "bin",
		clean: false,
		outExtension() {
			return { js: ".mjs" };
		}
	}
]);
