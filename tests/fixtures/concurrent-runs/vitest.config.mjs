/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/fixtures/concurrent-runs/vitest.config.mjs
 *	@Date: 2026-11-21T12:10:25-08:00 (1795291825)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-21T12:10:28-08:00 (1795291828)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * Config for the concurrent-runs fixture (tests/integration/concurrent-runs.test.vitest.mjs).
 */
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
	root: fileURLToPath(new URL(".", import.meta.url)),
	test: {
		include: ["slow/**/*.test.vitest.mjs", "quick/**/*.test.vitest.mjs"],
		coverage: { provider: "v8", include: ["src/**"], reporter: ["json-summary"] }
	}
});
