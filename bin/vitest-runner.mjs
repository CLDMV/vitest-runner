#!/usr/bin/env node
/**
 * @fileoverview CLI entry point for the vitest-runner binary.
 * @module vitest-runner/bin/vitest-runner
 *
 * Mirrors its own output to a log file when --coverage-quiet is set, then
 * delegates all logic to `src/runner.mjs` via the programmatic `run()` API.
 */

import { createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";
import { parseArguments } from "../src/cli/args.mjs";
import { showHelp } from "../src/cli/help.mjs";
import { run } from "../src/runner.mjs";
import { stripAnsi } from "../src/utils/ansi.mjs";

const args = parseArguments(process.argv.slice(2));

if (args.help) {
	showHelp();
	process.exit(0);
}

// Mirror all output (excluding progress bar lines) to a log file
// when running in --coverage-quiet mode (or when --log-file is set).
if (args.coverageQuiet || args.logFile) {
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
if ((args.coverageQuiet || args.logFile) && !vitestArgs.some((a) => a === "--coverage" || a.startsWith("--coverage."))) {
	vitestArgs.unshift("--coverage");
}

run({
	cwd,
	testPatterns: args.testPatterns,
	testListFile: args.testListFile,
	testFilePattern: args.testFilePattern,
	vitestArgs,
	showErrorDetails: args.showErrorDetails,
	coverageQuiet: args.coverageQuiet,
	...(args.workers !== undefined && { workers: args.workers }),
	...(args.soloPatterns.length > 0 && { earlyRunPatterns: args.soloPatterns })
})
	.then((code) => {
		process.exit(code);
	})
	.catch((err) => {
		console.error("Fatal error:", err);
		process.exit(1);
	});
