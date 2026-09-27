/**
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/fixtures/signal-exit/signal-self.mjs
 *	@Date: 2026-02-26T06:30:55-08:00 (1772116255)
 *	@Author: Shinrai <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Shinrai <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-09-27 08:51:32 -07:00 (1790524292)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 */

/**
 * Tiny stand-in "vitest binary" used by spawn tests to trigger a signal-based
 * (null exit-code) child-process termination.
 *
 * When Node runs this file it immediately sends SIGTERM to itself.  The OS
 * terminates the process with a signal, so the close event fires with
 * `code = null` — exercising the `code ?? 1` fallback branches in spawn.mjs.
 */
process.kill(process.pid, "SIGTERM");
