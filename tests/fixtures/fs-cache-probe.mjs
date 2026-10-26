/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/fixtures/fs-cache-probe.mjs
 *	@Date: 2026-10-26T00:00:00-07:00 (1792998000)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-10-26T06:46:37-07:00 (1793022397)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * Preload (`--import`) for the fs module cache tests. Records every recursive
 * `rm` of `FS_CACHE_PROBE_DIR` — how vitest clears its fs module cache — as one
 * line in `FS_CACHE_PROBE_LOG`, so a test can count how many processes cleared it.
 */
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";

const dir = process.env.FS_CACHE_PROBE_DIR;
const log = process.env.FS_CACHE_PROBE_LOG;

if (dir && log) {
	const originalRm = fsPromises.rm;
	fsPromises.rm = function probedRm(target, options) {
		if (path.resolve(String(target)) === path.resolve(dir)) fs.appendFileSync(log, `${process.pid}\n`);
		return originalRm.call(this, target, options);
	};
	// Vitest imports `rm` as a named ESM binding; push the patch through to it.
	syncBuiltinESMExports();
}
