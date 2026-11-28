/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /src/index.cjs
 *	@Date: 2026-09-27T23:05:10+00:00 (1790550310)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-25T19:39:18-08:00 (1795664358)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * @fileoverview CommonJS entry for @cldmv/vitest-runner. `require()` returns the ESM entry's module object ({ default, ...named }),
 * the same exports as `import`.
 */
"use strict";

if (!process.features?.require_module) {
	const error = new Error(
		`@cldmv/vitest-runner: require() needs Node.js >=22.13.0 (this is ${process.version}). On older Node.js, load the package with import() instead.`
	);
	error.code = "ERR_REQUIRE_ESM";
	throw error;
}

// Same exports as `import`. One distinct exported value (aliases of it count once) comes back as that value,
// so require(x)(...) works; anything else comes back as the module object ({ default, ...named }).
const esm = require("./index.mjs");
const values = new Set(
	Object.keys(esm)
		.filter((key) => key !== "__esModule")
		.map((key) => esm[key])
);
module.exports = values.size === 1 ? values.values().next().value : esm;
