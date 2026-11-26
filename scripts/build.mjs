/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /scripts/build.mjs
 *	@Date: 2026-11-25T19:38:24-08:00 (1795664304)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-25T19:39:17-08:00 (1795664357)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * @fileoverview Builds dist/ from src/: one minified file per source module, in the same layout.
 *
 * esbuild minifies each `src/**\/*.mjs` file on its own (`bundle: false`), keeping names for stack
 * traces and writing source maps back to src/. Nothing is bundled, so every module exists once and
 * the entries share it by plain relative imports: dist/bin/vitest-runner.mjs imports
 * dist/index.mjs, and dist/core/fs-cache.mjs finds dist/core/fs-cache-helper.mjs next to itself.
 * The hand-written CommonJS entry (src/index.cjs) is copied verbatim.
 */
import { copyFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
const src = path.join(root, "src");
const dist = path.join(root, "dist");

rmSync(dist, { recursive: true, force: true });

const entryPoints = readdirSync(src, { recursive: true })
	.map(String)
	.filter((file) => file.endsWith(".mjs"))
	.map((file) => path.join(src, file));

await build({
	entryPoints,
	outdir: dist,
	outbase: src,
	outExtension: { ".js": ".mjs" },
	bundle: false,
	format: "esm",
	platform: "node",
	target: "node22",
	minify: true,
	keepNames: true,
	sourcemap: true,
	logLevel: "warning"
});

copyFileSync(path.join(src, "index.cjs"), path.join(dist, "index.cjs"));
