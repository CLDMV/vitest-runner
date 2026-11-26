/**
 * @fileoverview Checks the build output under `npm run test:dist` (which builds first):
 * dist/ mirrors src/ one file per module, nothing is bundled, and the CLI imports the library.
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist");

/** @param {string} dir @param {RegExp} pattern */
const list = (dir, pattern) =>
	fs
		.readdirSync(dir, { recursive: true })
		.map(String)
		.filter((file) => pattern.test(file))
		.sort();

describe.runIf(import.meta.env.MODE === "dist")("dist/ build", () => {
	it("has one .mjs per source module and nothing else", () => {
		expect(list(DIST, /\.mjs$/)).toEqual(list(SRC, /\.mjs$/));
		expect(list(DIST, /\.cjs$/)).toEqual(["index.cjs"]);
		expect(fs.readFileSync(path.join(DIST, "index.cjs"), "utf8")).toBe(fs.readFileSync(path.join(SRC, "index.cjs"), "utf8"));
	});

	it("keeps each module's own imports instead of inlining them", () => {
		const cli = fs.readFileSync(path.join(DIST, "bin", "vitest-runner.mjs"), "utf8");
		expect(cli.startsWith("#!/usr/bin/env node\n")).toBe(true);
		expect(cli).toContain('from"../index.mjs"');
		expect(cli).toContain('from"../cli/args.mjs"');
		expect(fs.readFileSync(path.join(DIST, "index.mjs"), "utf8")).toContain('from"./core/spawn.mjs"');
	});

	it("is what package.json publishes as the CLI and the entry", () => {
		const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
		expect(pkg.bin["vitest-runner"]).toBe("dist/bin/vitest-runner.mjs");
		expect(pkg.exports["."].import).toBe("./dist/index.mjs");
		const help = spawnSync(process.execPath, [path.join(ROOT, pkg.bin["vitest-runner"]), "--help"], { encoding: "utf8" });
		expect(help.status).toBe(0);
		expect(help.stdout).toContain("--merge-heap-mb");
	});
});
