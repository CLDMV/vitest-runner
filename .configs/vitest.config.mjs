/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /.configs/vitest.config.mjs
 *	@Date: 2026-02-25T15:22:09-08:00 (1772061729)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-10-26T07:59:34-07:00 (1793026774)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

import { defineConfig, mergeConfig } from "vitest/config";
import { devCondition } from "@cldmv/configs/vitest.config.mjs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

// devCondition() puts the package's own vitest-runner-dev condition (which resolves the package
// name to src/) ahead of Vite's default conditions for the client and SSR resolvers, and on the
// worker command line.
export default mergeConfig(
	devCondition({ root }),
	defineConfig({
		test: {
			include: ["tests/**/*.test.vitest.{js,mjs,cjs}"],
			exclude: ["tests/fixtures/**", "node_modules/**"],
			coverage: {
				provider: "v8",
				include: ["src/**"],
				// src/bin/vitest-runner.mjs is exercised by tests/cli/bin.test.vitest.mjs, but
				// only via spawnSync into a SEPARATE node process — v8's in-process coverage
				// collector can't attribute execution across that boundary. Real coverage tool
				// gap, not untested code; excluded here rather than reported as permanently 0%.
				// src/core/fs-cache-helper.mjs is the same case: it only ever runs as its own
				// process (started by core/fs-cache.mjs). Its logic lives in fs-cache.mjs,
				// which tests/core/fs-cache.test.vitest.mjs calls in-process.
				exclude: ["src/bin/**", "src/core/fs-cache-helper.mjs"],
				reporter: ["text", "json", "json-summary"]
			},
			// Integration tests spawn child processes and can be slow
			testTimeout: 30_000
		}
	})
);
