/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/fixtures/watchdog/vitest.config.mjs
 *	@Date: 2026-11-22T21:41:25-08:00 (1795412485)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-22T21:43:40-08:00 (1795412620)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["**/*.watchdog.mjs"]
	}
});
