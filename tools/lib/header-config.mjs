/**
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tools/lib/header-config.mjs
 *	@Date: 2026-09-27 08:48:59 -07:00 (1790524139)
 *	@Author: Shinrai <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Shinrai <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-09-27 08:51:33 -07:00 (1790524293)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 */

/**
 * Shared configuration for file header validation and fixing.
 * Used by tools/fix-headers.mjs.
 */

/**
 * Folders to scan for file headers.
 * @type {Array<{path: string, recursive: boolean}>}
 */
export const FILE_HEADER_CHECK_FOLDERS = [
	{ path: ".configs", recursive: true },
	{ path: ".github", recursive: true },
	{ path: ".", recursive: false },
	{ path: "src", recursive: true },
	{ path: "tests", recursive: true },
	{ path: "tools", recursive: true }
];

/**
 * Folders/files to ignore when checking file headers. dist/ and bin/ are
 * build artifacts (gitignored) — @cldmv/fix-headers auto-respects .gitignore
 * by default, so they're excluded without needing to list them here too.
 * @type {string[]}
 */
export const FILE_HEADER_IGNORE_FOLDERS = [
	"coverage",
	"tmp",
	"node_modules",
	"tools/fix-headers.mjs" // self-exclusion
];
