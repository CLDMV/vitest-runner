/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/cjs/entry.test.cjs
 *	@Date: 2026-10-03T10:33:01-07:00 (1791048781)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-01T16:33:27-08:00 (1793579607)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * CommonJS entry tests. These run under Node's own test runner (`node --test`), not Vitest:
 * Vitest loads files through its own module runner, so it cannot show whether a plain
 * `require()` of the package works the way it does for a CommonJS consumer.
 */
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");

test("require() returns the same named exports as import", async () => {
	const required = require("../../dist/index.cjs");
	const esm = await import("../../dist/index.mjs");

	assert.equal(typeof required.run, "function");
	assert.equal(required.run, esm.run);
	assert.equal(required.resolveBin, esm.resolveBin);
	assert.equal(required.discoverVitestFiles, esm.discoverVitestFiles);
	assert.equal(required.formatDuration, esm.formatDuration);
	assert.deepEqual(Object.keys(required).sort(), Object.keys(esm).sort());
});

test("require() fails with a clear message where Node.js has no require(esm)", () => {
	// --no-experimental-require-module turns require(esm) off, which is what Node.js
	// versions without it look like to the entry.
	const res = spawnSync(process.execPath, ["--no-experimental-require-module", "-e", "require('./dist/index.cjs')"], {
		cwd: repoRoot,
		encoding: "utf8"
	});

	assert.notEqual(res.status, 0);
	assert.match(res.stderr, /ERR_REQUIRE_ESM/);
	assert.match(res.stderr, /require\(\) needs Node\.js >=22\.13\.0/);
	assert.match(res.stderr, /import\(\)/);
});

test("the vitest-runner-dev condition resolves require() and import to src/, and no condition to dist/", () => {
	const resolve = (conditions, expr) =>
		spawnSync(process.execPath, [...conditions, "-p", expr], { cwd: repoRoot, encoding: "utf8" }).stdout.trim();
	const dev = ["--conditions=vitest-runner-dev"];
	const requireExpr = "require.resolve('@cldmv/vitest-runner')";
	const importExpr = "import.meta.resolve('@cldmv/vitest-runner')";

	assert.equal(resolve(dev, requireExpr), path.join(repoRoot, "src/index.cjs"));
	assert.equal(resolve([], requireExpr), path.join(repoRoot, "dist/index.cjs"));
	assert.match(
		spawnSync(process.execPath, [...dev, "--input-type=module", "-e", `console.log(${importExpr})`], { cwd: repoRoot, encoding: "utf8" })
			.stdout,
		/\/src\/index\.mjs/
	);
});

// The generic shim returns the module object when the package exports several distinct values, so require() has the same
// keys as the ESM namespace (plus the `__esModule` marker) and every named value is the same one import gives. Checked in a
// plain Node.js child, where require(esm) and import() share one module instance, so `===` means something.
for (const dir of ["src", "dist"]) {
	test(`${dir}/index.cjs: require() has the ESM namespace's keys and values`, () => {
		const code = `
			const path = require("node:path");
			const dir = process.argv[1];
			import(path.resolve(dir, "index.mjs")).then((esm) => {
				const cjs = require(path.resolve(dir, "index.cjs"));
				const keys = (obj) => Object.keys(obj).filter((key) => key !== "__esModule").sort();
				console.log(JSON.stringify({
					type: typeof cjs,
					keys: JSON.stringify(keys(cjs)) === JSON.stringify(keys(esm)),
					count: keys(esm).length,
					values: keys(esm).every((key) => cjs[key] === esm[key]),
					noDefaultUnwrap: cjs.default === esm.default
				}));
			});`;
		const res = spawnSync(process.execPath, ["-e", code, path.join(repoRoot, dir)], { cwd: repoRoot, encoding: "utf8" });

		assert.equal(res.status, 0, res.stderr);
		const out = JSON.parse(res.stdout);
		assert.equal(out.type, "object");
		assert.ok(out.count > 1);
		assert.equal(out.keys, true);
		assert.equal(out.values, true);
		assert.equal(out.noDefaultUnwrap, true);
	});
}
