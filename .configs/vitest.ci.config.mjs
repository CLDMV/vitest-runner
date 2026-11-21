/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /.configs/vitest.ci.config.mjs
 *	@Date: 2026-02-25T17:34:15-08:00 (1772069655)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-07T21:39:25-08:00 (1794116365)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

import baseConfig from "./vitest.config.mjs";

// vitest.config.mjs is a function of the Vite mode, so resolve it first.
export default (env) => {
	const base = baseConfig(env);
	return {
		...base,

		// CI: pick a pool and force it to 1 worker.
		// Use forks for CI stability, but threads is fine too.
		// pool: "forks",
		maxForks: 1,
		minForks: 1,

		// Optional: if you choose pool: "threads" instead:
		// pool: "threads",
		maxThreads: 1,
		minThreads: 1,

		test: {
			...base.test,

			// CI: no file-level parallelism either (hard clamp)
			maxWorkers: 1,
			minWorkers: 1,
			fileParallelism: false
		}
	};
};
