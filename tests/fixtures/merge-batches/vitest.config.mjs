/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/fixtures/merge-batches/vitest.config.mjs
 *	@Date: 2026-11-21T11:54:03-08:00 (1795290843)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-21T11:56:14-08:00 (1795290974)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * Config for the merge-batches fixture project (tests/core/merge-batches.test.vitest.mjs).
 * Its own root, so coverage covers only this fixture's src/.
 */
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
	root: fileURLToPath(new URL(".", import.meta.url)),
	test: {
		include: ["cases/**/*.test.vitest.mjs", "red/**/*.test.vitest.mjs"],
		coverage: {
			provider: "v8",
			include: ["src/**"],
			reporter: ["json", "json-summary"]
		}
	}
});
