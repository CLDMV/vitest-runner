/**
 * @fileoverview Integration tests for the CLI binary behavior.
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
// Source, not the built bin/vitest-runner.mjs — bin/ is a build artifact (not tracked,
// not guaranteed to exist without an `npm run build`); tests run against source directly.
const BIN = path.join(ROOT, "src", "bin", "vitest-runner.mjs");

describe("vitest-runner CLI", () => {
	it("does not force coverage when --log-file is set", () => {
		const result = spawnSync(
			process.execPath,
			[
				BIN,
				"--json",
				"--log-file",
				"tmp/cli-no-force-coverage.log",
				"--config",
				"tests/fixtures/vitest.config.mjs",
				"--test-list",
				"tests/fixtures/test-list.json"
			],
			{
				cwd: ROOT,
				encoding: "utf8",
				env: { ...process.env }
			}
		);

		expect(result.status).toBe(0);
		expect(result.stderr).toBe("");
		const jsonStart = result.stdout.indexOf("{");
		expect(jsonStart).toBeGreaterThan(-1);
		const json = JSON.parse(result.stdout.slice(jsonStart));
		expect(json.mode).toBe("standard");
		expect(json.exitCode).toBe(0);
		expect(json.coverageSummary).toBeUndefined();
		expect(json.options?.vitestArgs ?? []).not.toContain("--coverage");
		expect(result.stdout).not.toContain("% Coverage report from v8");
	});
});
