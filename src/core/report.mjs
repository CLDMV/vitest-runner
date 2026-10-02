/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /src/core/report.mjs
 *	@Date: 2026-02-24T22:33:55-08:00 (1772001235)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-10-02T15:35:21-07:00 (1790980521)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * @fileoverview Result reporting and coverage summary utilities.
 * @module vitest-runner/src/core/report
 */

import fs from "node:fs/promises";
import path from "node:path";
import chalk from "chalk";
import { stripAnsi, colourPct, formatPct, isKnownPct } from "../utils/ansi.mjs";

/**
 * Print verbose output for files that failed during a quiet coverage run.
 *
 * @param {Array<{file: string, code: number, rawOutput: string}>} failedResults
 * @returns {void}
 * @example
 * printQuietCoverageFailureDetails(failedResults);
 */
export function printQuietCoverageFailureDetails(failedResults) {
	if (failedResults.length === 0) return;

	console.log(`\n${"=".repeat(80)}`);
	console.log(chalk.bold.red("✖ FAILED TEST FILES (VERBOSE OUTPUT)"));
	console.log("=".repeat(80));

	for (const r of failedResults) {
		console.log(`\n${chalk.red("✖")} ${chalk.red(r.file)} ${chalk.dim(`(exit ${r.code})`)}`);
		if (r.rawOutput?.trim()) {
			console.log(r.rawOutput.trimEnd());
		} else {
			console.log(chalk.dim("(no child output captured)"));
		}
	}

	console.log(`\n${"=".repeat(80)}`);
}

/**
 * Print the captured output from a quiet `--mergeReports` step.
 *
 * On success prints only the coverage block (from "% Coverage report from v8").
 * On failure prints the full raw output to stderr.
 *
 * @param {number} exitCode - The merge process exit code.
 * @param {string} output - Raw stdout + stderr from the merge process.
 * @returns {void}
 */
export function printMergeOutput(exitCode, output) {
	if (exitCode === 0) {
		const marker = "% Coverage report from v8";
		const rawLines = output.split("\n");
		const markerLineIndex = rawLines.findIndex((line) => stripAnsi(line).includes(marker));

		if (markerLineIndex >= 0) {
			let endLineIndex = rawLines.length;
			for (let i = markerLineIndex + 1; i < rawLines.length; i++) {
				const line = stripAnsi(rawLines[i]).trimStart();
				if (line.startsWith("stderr |") || line.startsWith("stdout |")) {
					endLineIndex = i;
					break;
				}
			}

			const coverageBody = rawLines
				.slice(markerLineIndex + 1, endLineIndex)
				.join("\n")
				.trimEnd();
			if (coverageBody) {
				const fullBlock = rawLines.slice(markerLineIndex, endLineIndex).join("\n").trimEnd();
				console.log(`\n${fullBlock}\n`);
			}
		}
	} else {
		const trimmed = output.trimEnd();
		if (trimmed) console.error(trimmed);
	}
}

/**
 * Compute a coverage-summary-style object from a raw V8/Istanbul `coverage-final.json`.
 *
 * Matches istanbul's own summary: a file with no entries for a metric counts as
 * 100% for that metric, and when there are no files at all every total `pct` is
 * the string `"Unknown"`.
 *
 * @param {Record<string, object>} finalData - Parsed `coverage-final.json` contents.
 * @returns {{ total: object, [filePath: string]: object }} Istanbul coverage-summary format.
 */
export function computeSummaryFromFinal(finalData) {
	const pct = (covered, total) => (total === 0 ? 100 : parseFloat(((covered / total) * 100).toFixed(2)));
	const summary = {
		total: {
			statements: { total: 0, covered: 0, pct: 0 },
			branches: { total: 0, covered: 0, pct: 0 },
			functions: { total: 0, covered: 0, pct: 0 },
			lines: { total: 0, covered: 0, pct: 0 }
		}
	};

	for (const [filePath, data] of Object.entries(finalData)) {
		const sKeys = Object.keys(data.s ?? {});
		const stmtTotal = sKeys.length;
		const stmtCovered = sKeys.filter((k) => data.s[k] > 0).length;

		const fKeys = Object.keys(data.f ?? {});
		const fnTotal = fKeys.length;
		const fnCovered = fKeys.filter((k) => data.f[k] > 0).length;

		let branchTotal = 0,
			branchCovered = 0;
		for (const counts of Object.values(data.b ?? {})) {
			branchTotal += counts.length;
			branchCovered += counts.filter((c) => c > 0).length;
		}

		const coveredLines = new Set();
		const totalLines = new Set();
		for (const [sid, loc] of Object.entries(data.statementMap ?? {})) {
			const line = loc?.start?.line;
			if (line == null) continue;
			totalLines.add(line);
			if ((data.s ?? {})[sid] > 0) coveredLines.add(line);
		}

		const fileStats = {
			statements: { total: stmtTotal, covered: stmtCovered, pct: pct(stmtCovered, stmtTotal) },
			branches: { total: branchTotal, covered: branchCovered, pct: pct(branchCovered, branchTotal) },
			functions: { total: fnTotal, covered: fnCovered, pct: pct(fnCovered, fnTotal) },
			lines: { total: totalLines.size, covered: coveredLines.size, pct: pct(coveredLines.size, totalLines.size) }
		};
		summary[filePath] = fileStats;

		for (const key of ["statements", "branches", "functions", "lines"]) {
			summary.total[key].total += fileStats[key].total;
			summary.total[key].covered += fileStats[key].covered;
		}
	}

	const hasFiles = Object.keys(finalData).length > 0;
	for (const key of ["statements", "branches", "functions", "lines"]) {
		const { total, covered } = summary.total[key];
		summary.total[key].pct = hasFiles ? pct(covered, total) : "Unknown";
	}

	return summary;
}

/**
 * Lowest known metric of a worst-files row, or `null` when every metric is non-numeric.
 *
 * @param {{lines: number|string, stmts: number|string, fns: number|string, branches: number|string}} row
 * @returns {number|null}
 */
function lowestKnownPct({ lines, stmts, fns, branches }) {
	const known = [lines, stmts, fns, branches].filter(isKnownPct);
	return known.length > 0 ? Math.min(...known) : null;
}

/**
 * Sort key for a worst-files row: rows with no numeric metric at all sort after
 * every measured row.
 *
 * @param {number|null} worst - Result of {@link lowestKnownPct}.
 * @returns {number}
 */
function worstSortKey(worst) {
	return worst ?? Number.MAX_VALUE;
}

/**
 * Whether any metric of a worst-files row is non-numeric (e.g. `"Unknown"`).
 *
 * @param {{lines: number|string, stmts: number|string, fns: number|string, branches: number|string}} row
 * @returns {boolean}
 */
function hasUnknownPct({ lines, stmts, fns, branches }) {
	return ![lines, stmts, fns, branches].every(isKnownPct);
}

/**
 * Print the one-line overall coverage totals.
 *
 * @param {{lines: number|string, stmts: number|string, fns: number|string, branches: number|string}} totals
 * @returns {void}
 */
function printTotalsLine({ lines, stmts, fns, branches }) {
	console.log(
		`\n  ${chalk.bold("Coverage")}  ${colourPct(chalk, lines)}% lines ${chalk.dim("|")} ${colourPct(chalk, stmts)}% statements ${chalk.dim("|")} ${colourPct(chalk, fns)}% functions ${chalk.dim("|")} ${colourPct(chalk, branches)}% branches`
	);
}

/**
 * Read the coverage JSON produced after a `mergeReports` run and print a
 * worst-offenders table plus overall-coverage totals.
 *
 * Tries `coverage-summary.json` first; falls back to computing from
 * `coverage-final.json` if that is not present.
 *
 * A non-numeric `pct` (istanbul reports `"Unknown"` when the coverage `include`
 * matched no files) is printed as `Unknown` and never throws. When no files were
 * measured at all, a note says so: there is nothing for a coverage threshold to
 * measure, and vitest's own threshold check does not fail on an `Unknown` value.
 *
 * @param {string} cwd - Project root (used to make absolute file paths relative).
 * @param {string[]} extraCoverageArgs - Passthrough `--coverage.*` args (checked for `reportsDirectory`).
 * @param {number} [worstCount=10] - Number of worst-coverage files to show (0 = skip table).
 * @param {{silent?: boolean}} [options] - Output controls.
 * @returns {Promise<{
 *  coverageDir: string,
 *  total: object,
 *  noFilesMeasured: boolean,
 *  worstFiles: Array<{file: string, lines: number|string, stmts: number|string, fns: number|string, branches: number|string}>,
 *  worstFilesShown: number,
 *  worstFilesTotal: number,
 *  summary: object
 * }|null>}
 */
export async function printCoverageSummary(cwd, extraCoverageArgs, worstCount = 10, options = {}) {
	const { silent = false } = options;
	let coverageDir = path.resolve(cwd, "coverage");
	const repoDirArg = extraCoverageArgs.find((a) => a.startsWith("--coverage.reportsDirectory="));
	if (repoDirArg) {
		const raw = repoDirArg.split("=").slice(1).join("=");
		coverageDir = path.isAbsolute(raw) ? raw : path.resolve(cwd, raw);
	}

	let summary;

	try {
		const content = await fs.readFile(path.join(coverageDir, "coverage-summary.json"), "utf8");
		summary = JSON.parse(content);
	} catch {
		try {
			const content = await fs.readFile(path.join(coverageDir, "coverage-final.json"), "utf8");
			summary = computeSummaryFromFinal(JSON.parse(content));
		} catch {
			if (!silent) console.log(chalk.dim("  (no coverage JSON found — skipping summary)"));
			return null;
		}
	}

	const { total, ...fileSummaries } = summary;
	const totals = {
		lines: total.lines?.pct ?? 0,
		stmts: total.statements?.pct ?? 0,
		fns: total.functions?.pct ?? 0,
		branches: total.branches?.pct ?? 0
	};
	const noFilesMeasured = Object.keys(fileSummaries).length === 0 && !Object.values(totals).some(isKnownPct);

	let worstFiles = [];
	let worstFilesTotal = 0;

	if (worstCount > 0) {
		const fileRows = Object.entries(fileSummaries)
			.map(([absFile, data]) => ({
				file: path.relative(cwd, absFile),
				lines: data.lines?.pct ?? 0,
				stmts: data.statements?.pct ?? 0,
				fns: data.functions?.pct ?? 0,
				branches: data.branches?.pct ?? 0
			}))
			.map((row) => ({ row, worst: lowestKnownPct(row) }))
			.filter(({ row, worst }) => hasUnknownPct(row) || worst < 100)
			.sort((a, b) => worstSortKey(a.worst) - worstSortKey(b.worst));
		const rowsToShow = fileRows.slice(0, worstCount);

		if (!silent) {
			console.log("\n" + chalk.bold("📉 WORST COVERAGE FILES (lowest metric)"));
			console.log("-".repeat(80));

			rowsToShow.forEach(({ row: { file, lines, stmts, fns, branches }, worst }) => {
				const extras = chalk.dim(
					`lines ${formatPct(lines, 0)}% | stmts ${formatPct(stmts, 0)}% | fns ${formatPct(fns, 0)}% | branches ${formatPct(branches, 0)}%`
				);
				console.log(`  ${colourPct(chalk, worst)}%  ${chalk.dim(file)}  ${extras}`);
			});

			if (fileRows.length > worstCount) {
				console.log(chalk.dim(`  ... and ${fileRows.length - worstCount} more files`));
			}
		}

		worstFiles = rowsToShow.map(({ row }) => row);
		worstFilesTotal = fileRows.length;
	}

	if (!silent) {
		printTotalsLine(totals);
		if (noFilesMeasured) {
			console.log(
				chalk.dim(
					"  No files were measured (the coverage include matched nothing), so every percentage is Unknown and coverage thresholds are skipped."
				)
			);
		}
	}

	return {
		coverageDir,
		total,
		noFilesMeasured,
		worstFiles,
		worstFilesShown: worstFiles.length,
		worstFilesTotal,
		summary
	};
}
