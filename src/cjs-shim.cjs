/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /src/cjs-shim.cjs
 *	@Date: 2026-09-27T23:05:10+00:00 (1790550310)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-10-03T10:36:56-07:00 (1791049016)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * CommonJS entry point — a thin, synchronous re-export of the real ESM build.
 *
 * Node's `require()` can load an ES module synchronously and get back its
 * exports directly (no Promise, no top-level await involved on this module's
 * side) as long as the target module doesn't itself use top-level await —
 * `src/runner.mjs` doesn't. This mirrors @cldmv/uuid's index.cjs pattern
 * instead of tsup bundling a second, independent copy of the whole module
 * for the CJS format. In a .cjs file `require` already exists, so a plain
 * `require("./index.mjs")` is used — `createRequire` is unnecessary here and
 * breaks bundling by tools (esbuild/webpack) that need a static `require()`
 * call to detect the dependency.
 *
 * Node.js versions without require(esm) (before 20.19 / 22.12) would fail with
 * a bare ERR_REQUIRE_ESM, so the check below fails early with a message that
 * says what to do instead.
 *
 * This file is copied verbatim into dist/index.cjs by tsup's onSuccess hook
 * (see tsup.config.mjs) — it never passes through esbuild itself, so it
 * stays exactly this small regardless of how much src/runner.mjs grows.
 *
 * @module @cldmv/vitest-runner
 */
"use strict";

if (!process.features?.require_module) {
	const error = new Error(
		`@cldmv/vitest-runner: require() needs Node.js ^20.19.0 or >=22.12.0 (this is ${process.version}). On older Node.js, load the package with import() instead.`
	);
	error.code = "ERR_REQUIRE_ESM";
	throw error;
}

module.exports = require("./index.mjs");
