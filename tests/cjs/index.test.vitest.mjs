/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/cjs/index.test.vitest.mjs
 *	@Date: 2026-10-26T00:00:00-07:00 (1792998000)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-10-26T00:00:00-07:00 (1792998000)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * @fileoverview Tests for the CommonJS entry, loaded from source (`src/index.cjs`).
 *
 * The file is loaded with Node's own `require()` (through `createRequire`), so it
 * runs the way it does for a CommonJS consumer and counts towards coverage. Its one
 * dependency, `./index.mjs`, is handed the copy Vitest already loaded: letting Node
 * load `src/index.mjs` natively would load every source module a second time outside
 * Vitest, and those copies would drag down coverage for the whole tree.
 * tests/cjs/entry.test.cjs checks the real `require(esm)` load of the built
 * `dist/index.cjs` under `node --test`.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Module, { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esm from "../../src/index.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.resolve(__dirname, "../../src/index.cjs");
const require = createRequire(import.meta.url);

// `process.features` itself is read-only, but `require_module` is a configurable getter.
const requireModuleDescriptor = Object.getOwnPropertyDescriptor(process.features, "require_module");

const originalLoad = Module._load;

describe("src/index.cjs", () => {
	beforeEach(() => {
		Module._load = function load(request, parent, isMain) {
			if (request === "./index.mjs" && parent?.filename === ENTRY) return esm;
			return originalLoad.call(this, request, parent, isMain);
		};
	});

	afterEach(() => {
		Module._load = originalLoad;
		Object.defineProperty(process.features, "require_module", requireModuleDescriptor);
		delete require.cache[ENTRY];
	});

	it("exports the ESM entry's module namespace", () => {
		const required = require(ENTRY);

		expect(required).toBe(esm);
		expect(typeof required.run).toBe("function");
	});

	it("fails with a clear message where Node.js has no require(esm)", () => {
		Object.defineProperty(process.features, "require_module", { ...requireModuleDescriptor, get: () => false });

		let error;
		try {
			require(ENTRY);
		} catch (err) {
			error = err;
		}

		expect(error?.code).toBe("ERR_REQUIRE_ESM");
		expect(error?.message).toMatch(/require\(\) needs Node\.js \^20\.19\.0 or >=22\.12\.0/);
		expect(error?.message).toMatch(/import\(\)/);
	});
});
