/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /src/core/merge-batches-helper.mjs
 *	@Date: 2026-11-21T11:52:30-08:00 (1795290750)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-21T11:56:12-08:00 (1795290972)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * @fileoverview Helper process started by reduceBlobsInBatches() (see merge-batches.mjs).
 *
 * Merges one batch of blob files into one blob file with the installed vitest's
 * own `flatted` and `@vitest/istanbul-lib-coverage`, then exits. Running each
 * batch in its own process gives every reduction a fresh, bounded heap.
 *
 * Argument: path to a JSON job file `{ vitestDir, expectedVersion, inputs, output }`.
 * Prints `{ ok }` or `{ message }` as JSON on its last stdout line. Exit codes:
 * 0 = merged, 3 = a blob doesn't have the supported layout, 1 = any other error.
 */

import fs from "node:fs/promises";
import { loadBlobLibraries, reduceBlobFiles, UnsupportedBlobError, UNSUPPORTED_EXIT_CODE } from "./merge-batches.mjs";

try {
	const { vitestDir, expectedVersion, inputs, output } = JSON.parse(await fs.readFile(process.argv[2], "utf-8"));
	const { flatted, libCoverage } = await loadBlobLibraries(vitestDir);
	await reduceBlobFiles({ inputs, output, expectedVersion, flatted, libCoverage });
	process.stdout.write(`\n${JSON.stringify({ ok: true })}\n`);
	process.exit(0);
} catch (error) {
	process.stdout.write(`\n${JSON.stringify({ message: String(error?.message ?? error) })}\n`);
	process.exit(error instanceof UnsupportedBlobError ? UNSUPPORTED_EXIT_CODE : 1);
}
