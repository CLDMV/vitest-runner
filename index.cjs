/**
 * @fileoverview CJS shim — dynamically imports the ESM entry point so that
 * CommonJS callers can `require('vitest-runner')`.
 *
 * Because the package is pure ESM (`"type": "module"`) we cannot use `module.exports =`
 * directly; instead we export a promise and re-attach named exports once resolved.
 *
 * @example
 * // CommonJS usage
 * const { run } = await require('vitest-runner');
 */

"use strict";

// Async shim: re-export everything from the ESM module.
// Callers must await the result or use .then().
module.exports = import("./index.mjs");
