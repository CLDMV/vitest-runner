/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/fixtures/fs-cache-probe.mjs
 *	@Date: 2026-10-26T00:00:00-07:00 (1792998000)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-10-26T07:59:50-07:00 (1793026790)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * Preload (`--import`) for the fs module cache tests. Records every clear of
 * `FS_CACHE_PROBE_DIR` (an `rm` of it, or a successful `rename` away from it) as
 * one line in `FS_CACHE_PROBE_LOG` naming the clearing process's script, so a
 * test can count how many processes cleared it and which ones.
 */
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";

const dir = process.env.FS_CACHE_PROBE_DIR;
const log = process.env.FS_CACHE_PROBE_LOG;

if (dir && log) {
	const record = (target) => {
		if (path.resolve(String(target)) === path.resolve(dir)) fs.appendFileSync(log, `${path.basename(process.argv[1] ?? "")}\n`);
	};
	// Vitest up to 5.0 removes the cache directory in place; 5.1 renames it
	// aside first and removes the renamed copy. Either counts as one clear.
	const originalRm = fsPromises.rm;
	fsPromises.rm = function probedRm(target, options) {
		record(target);
		return originalRm.call(this, target, options);
	};
	const originalRename = fsPromises.rename;
	fsPromises.rename = function probedRename(from, to) {
		// Only a rename that worked is a clear; a failed one falls back to rm.
		return originalRename.call(this, from, to).then((result) => {
			record(from);
			return result;
		});
	};
	// Vitest imports `rm` and `rename` as named ESM bindings; push the patches through to them.
	syncBuiltinESMExports();
}
