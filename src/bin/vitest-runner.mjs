#!/usr/bin/env node
/**
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /src/bin/vitest-runner.mjs
 *	@Date: 2026-09-27T03:47:31-07:00 (1790506051)
 *	@Author: Shinrai <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Shinrai <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-09-27 08:51:30 -07:00 (1790524290)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 */

/**
 * @fileoverview CLI entry point for the vitest-runner binary.
 * @module vitest-runner/src/bin/vitest-runner
 *
 * Mirrors its own output to a log file when --coverage-quiet or --log-file is set, then
 * delegates all logic to `runner.mjs` via the programmatic `run()` API.
 *
 * This is the SOURCE — `npm run build` bundles it (with its src/cli/* dependencies
 * inlined) into the published bin/vitest-runner.mjs. bin/ is a build artifact, not
 * tracked in git; run this file directly (as tests do) for source-level dev/testing.
 */

import { createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";
import { parseArguments } from "../cli/args.mjs";
import { showHelp } from "../cli/help.mjs";
import { run } from "../runner.mjs";
import { stripAnsi } from "../utils/ansi.mjs";

const args = parseArguments(process.argv.slice(2));

if (args.help) {
	showHelp();
	process.exit(0);
}

// Mirror all output (excluding progress bar lines) to a log file
// when running in --coverage-quiet mode (or when --log-file is set).
if ((args.coverageQuiet || args.logFile) && !args.json) {
	const cwd = process.cwd();
	const resolvedLogFile = args.logFile
		? path.isAbsolute(args.logFile)
			? args.logFile
			: path.resolve(cwd, args.logFile)
		: path.join(cwd, "coverage", "coverage-run.log");
	mkdirSync(path.dirname(resolvedLogFile), { recursive: true });
	const logStream = createWriteStream(resolvedLogFile, { flags: "a" });
	const origStdoutWrite = process.stdout.write.bind(process.stdout);
	const origStderrWrite = process.stderr.write.bind(process.stderr);

	/**
	 * Determine if a chunk is a progress-bar write that should be excluded from the log.
	 * TTY mode uses `\r` to overwrite in place; non-TTY prints "progress N.N% ..." lines.
	 * @param {Buffer|string} chunk
	 * @returns {boolean}
	 */
	function isProgressChunk(chunk) {
		const str = chunk.toString();
		return str.startsWith("\r") || /^progress \d+\.\d+%/.test(str);
	}

	process.stdout.write = (chunk, enc, cb) => {
		if (!isProgressChunk(chunk)) logStream.write(stripAnsi(chunk.toString()));
		return origStdoutWrite(chunk, enc, cb);
	};

	process.stderr.write = (chunk, enc, cb) => {
		if (!isProgressChunk(chunk)) logStream.write(stripAnsi(chunk.toString()));
		return origStderrWrite(chunk, enc, cb);
	};

	process.on("exit", () => logStream.end());
}

const cwd = process.cwd();

const vitestArgs = [...args.vitestPassthroughArgs];
if (args.coverageQuiet && !vitestArgs.some((a) => a === "--coverage" || a.startsWith("--coverage."))) {
	vitestArgs.unshift("--coverage");
}

try {
	const runResult = await run({
		cwd,
		testPatterns: args.testPatterns,
		testListFile: args.testListFile,
		testFilePattern: args.testFilePattern,
		vitestArgs,
		showErrorDetails: args.showErrorDetails,
		coverageQuiet: args.coverageQuiet,
		suppressFileOutput: args.suppressFileOutput,
		suppressPassingFiles: args.suppressPassingFiles,
		topSummary: args.topSummary,
		json: args.json,
		mergeReports: args.mergeReports,
		keepTmp: args.keepTmp,
		...(args.blobsDir !== undefined && { blobsDir: args.blobsDir }),
		...(args.workers !== undefined && { workers: args.workers }),
		...(args.soloPatterns.length > 0 && { earlyRunPatterns: args.soloPatterns }),
		...(args.scratchDir !== undefined && { scratchDir: args.scratchDir })
	});

	if (args.json) {
		process.stdout.write(`${JSON.stringify(runResult, null, 2)}\n`);
		process.exit(typeof runResult === "object" && runResult !== null && "exitCode" in runResult ? runResult.exitCode : 1);
	}

	process.exit(typeof runResult === "number" ? runResult : 1);
} catch (err) {
	console.error("Fatal error:", err);
	process.exit(1);
}
