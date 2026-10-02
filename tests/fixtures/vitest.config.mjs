/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/fixtures/vitest.config.mjs
 *	@Date: 2026-02-24T23:27:21-08:00 (1772004441)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-10-02T15:35:36-07:00 (1790980536)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * Minimal Vitest config used by integration tests when spawning child vitest
 * processes against fixture test files.  Intentionally has no `exclude` so the
 * fixture files under this directory are not blocked from running.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["**/*.test.vitest.{js,mjs,cjs}"]
	}
});
