/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /src/core/fs-cache-helper.mjs
 *	@Date: 2026-10-26T00:00:00-07:00 (1792998000)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-10-26T08:18:12-07:00 (1793027892)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * @fileoverview Helper process started by prepareFsModuleCache() (see fs-cache.mjs).
 *
 * Loads the project's own `vitest/node`, plans the fs module cache and, when
 * asked, does Vitest's lockfile check once. Prints the result as JSON on its
 * last stdout line and exits, even if the project's config leaves handles open.
 *
 * Argument: a JSON payload `{ cwd, args, fsModuleCachePath, warm }`.
 */

import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { planFsModuleCache, warmFsModuleCache } from "./fs-cache.mjs";

const { cwd, args, fsModuleCachePath, warm } = JSON.parse(process.argv[2]);

try {
	const require = createRequire(pathToFileURL(path.join(cwd, "package.json")));
	const vitestNode = await import(pathToFileURL(require.resolve("vitest/node")).href);

	const plan = await planFsModuleCache(vitestNode, { cwd, args, fsModuleCachePath });
	const warmed = Boolean(warm && plan.cacheEnabled);
	if (warmed) await warmFsModuleCache(vitestNode, { args, cacheArgs: plan.cacheArgs });

	process.stdout.write(`\n${JSON.stringify({ ...plan, warmed })}\n`);
	process.exit(0);
} catch (error) {
	process.stdout.write(`\n${JSON.stringify({ error: String(error?.message ?? error) })}\n`);
	process.exit(1);
}
