/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /src/cjs-shim.cjs
 *	@Date: 2026-09-27T23:05:10+00:00 (1790550310)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-10-02T15:35:18-07:00 (1790980518)
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
 * for the CJS format.
 *
 * This file is copied verbatim into dist/index.cjs by tsup's onSuccess hook
 * (see tsup.config.mjs) — it never passes through esbuild itself, so it
 * stays exactly this small regardless of how much src/runner.mjs grows.
 *
 * @module @cldmv/vitest-runner
 */
"use strict";
const { createRequire } = require("node:module");
const requireESM = createRequire(__filename);

module.exports = requireESM("./index.mjs");
