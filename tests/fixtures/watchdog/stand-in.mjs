/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/fixtures/watchdog/stand-in.mjs
 *	@Date: 2026-11-22T21:41:25-08:00 (1795412485)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-25T18:53:23-08:00 (1795661603)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * Stand-in "vitest binary" for the watchdog tests. runSingleFile runs it as
 * `node stand-in.mjs [--config <c>] run <file>`; WATCHDOG_MODE picks how it misbehaves:
 *
 * - hang:        prints a line, starts a grandchild, then waits forever
 * - silent:      starts a grandchild and waits forever without printing anything
 * - chatty:      prints a line every 100 ms forever
 * - heartbeat:   prints nothing, writes to VITEST_RUNNER_HEARTBEAT_FD (when set) every 100 ms
 *                for about 1.2 s, then exits 0
 * - ignore-term: like hang, but it and its grandchild ignore SIGTERM (and print when they get it)
 * - escape:      like ignore-term, but the grandchild leaves the process group and keeps the
 *                output pipes open
 *
 * The grandchild's pid is written to WATCHDOG_PID_FILE so a test can check it was killed.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";

const mode = process.env.WATCHDOG_MODE ?? "hang";
const pidFile = process.env.WATCHDOG_PID_FILE;
const ignoreTerm = mode === "ignore-term" || mode === "escape";

if (ignoreTerm) process.on("SIGTERM", () => process.stdout.write("stand-in got SIGTERM, ignoring it\n"));

if (mode === "heartbeat") {
	const fd = Number(process.env.VITEST_RUNNER_HEARTBEAT_FD);
	const beat = setInterval(() => {
		if (fd > 2) fs.writeSync(fd, "\n");
	}, 100);
	setTimeout(() => {
		clearInterval(beat);
		process.exit(0);
	}, 1200);
} else if (mode === "chatty") {
	let n = 0;
	setInterval(() => process.stdout.write(`tick ${++n}\n`), 100);
} else {
	const grandchildCode = ignoreTerm ? 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);' : "setInterval(() => {}, 1000);";
	const grandchild = spawn(process.execPath, ["-e", grandchildCode], {
		// "escape" puts the grandchild in a new session, out of the group, holding our stdout/stderr.
		detached: mode === "escape",
		stdio: mode === "escape" ? ["ignore", "inherit", "inherit"] : "ignore"
	});
	if (pidFile) fs.writeFileSync(pidFile, String(grandchild.pid));
	if (mode !== "silent") process.stdout.write(`stand-in started grandchild ${grandchild.pid}\n`);
	setInterval(() => {}, 1000);
}
