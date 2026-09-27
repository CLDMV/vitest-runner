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
