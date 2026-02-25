/**
 * @fileoverview Vitest output parsing and error deduplication utilities.
 * @module vitest-runner/src/core/parse
 */

import { stripAnsi } from "../utils/ansi.mjs";

/**
 * @typedef {Object} ParsedVitestResult
 * @property {number} testFilesPass - Number of test files that passed.
 * @property {number} testFilesFail - Number of test files that failed.
 * @property {number} testsPass - Number of individual tests that passed.
 * @property {number} testsFail - Number of individual tests that failed.
 * @property {number} testsSkip - Number of individual tests that were skipped.
 * @property {number} duration - Duration in milliseconds (from Vitest output).
 * @property {number|null} heapMb - Peak heap usage in MB, or `null` if not reported.
 * @property {string[]} errors - Array of raw error blocks (with ANSI codes).
 */

/**
 * Parse raw Vitest stdout/stderr output into structured result data.
 *
 * Extracts test-file counts, individual test counts, duration, heap usage,
 * and error blocks.  Counts are parsed from ANSI-stripped output; error blocks
 * are captured from the original coloured output.
 *
 * @param {string} output - Combined raw stdout + stderr from a vitest child process.
 * @returns {ParsedVitestResult}
 * @example
 * const result = parseVitestOutput(rawOutput);
 * console.log(result.testsPass, result.testsFail);
 */
export function parseVitestOutput(output) {
	const cleanOutput = stripAnsi(output);

	const result = {
		testFilesPass: 0,
		testFilesFail: 0,
		testsPass: 0,
		testsFail: 0,
		testsSkip: 0,
		duration: 0,
		heapMb: null,
		errors: []
	};

	// "Test Files  1 passed (1)" / "Test Files  1 failed | 2 passed (3)"
	const testFilesLineMatch = cleanOutput.match(/Test Files\s+(.+)/);
	if (testFilesLineMatch) {
		const line = testFilesLineMatch[1];
		const passMatch = line.match(/(\d+)\s+passed/);
		const failMatch = line.match(/(\d+)\s+failed/);
		if (passMatch) result.testFilesPass = parseInt(passMatch[1], 10);
		if (failMatch) result.testFilesFail = parseInt(failMatch[1], 10);
	}

	// "Tests  82 passed (82)" / "Tests  2 failed | 4 passed (6)"
	const testsLineMatch = cleanOutput.match(/^\s*Tests\s+(.+)$/m);
	if (testsLineMatch) {
		const line = testsLineMatch[1];
		const passMatch = line.match(/(\d+)\s+passed/);
		const failMatch = line.match(/(\d+)\s+failed/);
		const skipMatch = line.match(/(\d+)\s+skipped/);
		if (passMatch) result.testsPass = parseInt(passMatch[1], 10);
		if (failMatch) result.testsFail = parseInt(failMatch[1], 10);
		if (skipMatch) result.testsSkip = parseInt(skipMatch[1], 10);
	}

	// "Duration  Xs"
	const durationMatch = cleanOutput.match(/Duration\s+([\d.]+)s/);
	if (durationMatch) {
		result.duration = parseFloat(durationMatch[1]) * 1000;
	}

	// "N MB heap used"
	const heapMatch = cleanOutput.match(/(\d+)\s*MB\s+heap\s+used/i);
	if (heapMatch) {
		result.heapMb = parseInt(heapMatch[1], 10);
	}

	// Error blocks — captured from the raw (coloured) output
	const failedSectionStart = output.indexOf("Failed Tests");
	if (failedSectionStart !== -1) {
		const failedSectionEnd = output.indexOf("\n Test Files", failedSectionStart);
		const errorSection =
			failedSectionEnd !== -1 ? output.substring(failedSectionStart, failedSectionEnd) : output.substring(failedSectionStart);

		// eslint-disable-next-line no-control-regex
		const failPattern = /FAIL\s*(?:\x1B\[[0-9;]*[a-zA-Z]|\s)*tests\//g;
		const matches = [...errorSection.matchAll(failPattern)];

		for (let i = 0; i < matches.length; i++) {
			const matchPos = matches[i].index;
			const lineStart = errorSection.lastIndexOf("\n", matchPos);
			const actualStart = lineStart === -1 ? 0 : lineStart;

			const matchEnd = i < matches.length - 1 ? matches[i + 1].index : errorSection.length;
			const nextLineStart = errorSection.lastIndexOf("\n", matchEnd);
			const actualEnd = nextLineStart === -1 ? matchEnd : nextLineStart;

			const errorBlock = errorSection.substring(actualStart, actualEnd).trim();
			if (errorBlock) result.errors.push(errorBlock);
		}
	}

	return result;
}

/**
 * Deduplicate similar FAIL lines that differ only by their `Config:` value.
 *
 * When the same test file fails across multiple matrix configs vitest emits
 * one FAIL line per config.  This collapses them into a single line listing
 * all configs as an array, keeping output concise.
 *
 * @param {string[]} errors - Array of raw error blocks (each a complete FAIL section).
 * @returns {string} Deduplicated error text joined as a single string.
 * @example
 * const deduped = deduplicateErrors(result.errors);
 * console.log(deduped);
 */
export function deduplicateErrors(errors) {
	const fullText = errors.join("\n");
	const lines = fullText.split("\n");

	const failLineMap = new Map();
	const lineIndices = new Map();

	lines.forEach((line, idx) => {
		if (line.includes("FAIL") && line.includes("Config:")) {
			lineIndices.set(line, idx);

			const cleaned = stripAnsi(line);
			const match = cleaned.match(/^(.+Config:\s+)'*([^'>]+)'*(.+)$/);
			if (match) {
				const [, before, config, after] = match;
				const pattern = `${before.trim()}|||${after.trim()}`;

				if (!failLineMap.has(pattern)) {
					failLineMap.set(pattern, { lines: [], configs: [] });
				}
				failLineMap.get(pattern).lines.push(line);
				failLineMap.get(pattern).configs.push(config.replace(/'/g, ""));
			}
		}
	});

	const skipIndices = new Set();

	for (const [, data] of failLineMap.entries()) {
		if (data.configs.length > 1) {
			for (let i = 1; i < data.lines.length; i++) {
				const idx = lineIndices.get(data.lines[i]);
				if (idx !== undefined) skipIndices.add(idx);
			}

			const firstLine = data.lines[0];
			const configArray = `[${data.configs.map((c) => `'${c}'`).join(",")}]`;
			const consolidated = stripAnsi(firstLine).replace(/(Config:\s+)'*[^'>]+'*/, `$1${configArray}`);

			const firstIdx = lineIndices.get(firstLine);
			if (firstIdx !== undefined) lines[firstIdx] = consolidated;
		}
	}

	return lines.filter((_, idx) => !skipIndices.has(idx)).join("\n");
}
