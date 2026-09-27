/**
 * @fileoverview Compatibility wrapper that delegates header fixing to @cldmv/fix-headers.
 * @module tools/fix-headers
 * @internal
 *
 * @example
 * node tools/fix-headers.mjs --dry-run
 *
 * @example
 * node tools/fix-headers.mjs --verbose
 */

import { fixHeaders } from "@cldmv/fix-headers";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FILE_HEADER_CHECK_FOLDERS, FILE_HEADER_IGNORE_FOLDERS } from "./lib/header-config.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

/**
 * Print CLI help.
 * @returns {void}
 * @example
 * showHelp();
 */
function showHelp() {
	console.log(`
vitest-runner File Header Fixer
Delegates execution to @cldmv/fix-headers.

USAGE:
  node tools/fix-headers.mjs [OPTIONS]

OPTIONS:
  --dry-run     Compute changes without writing files (also enables --diff)
  --verbose     Show per-file issue details and error list
  --diff        Show unified diff output for changed files
  --help, -h    Show this help message
`);
}

/**
 * Parse CLI arguments into runner options.
 * @param {string[]} args - Raw process arguments excluding node and script path.
 * @returns {{ help: boolean, dryRun: boolean, verbose: boolean, diff: boolean }} Parsed options.
 * @example
 * const opts = parseArguments(["--dry-run", "--verbose"]);
 */
function parseArguments(args) {
	let help = false;
	let dryRun = false;
	let verbose = false;
	let diff = false;

	for (const arg of args) {
		if (arg === "--help" || arg === "-h") {
			help = true;
		} else if (arg === "--dry-run") {
			dryRun = true;
			diff = true; // dry-run always implies diff
		} else if (arg === "--verbose") {
			verbose = true;
		} else if (arg === "--diff") {
			diff = true;
		}
	}

	return { help, dryRun, verbose, diff };
}

/**
 * Build fixHeaders options from parsed CLI args and project header config.
 * @param {{ dryRun: boolean }} parsed - Parsed CLI arguments.
 * @returns {Parameters<typeof fixHeaders>[0]} Options for @cldmv/fix-headers.
 * @example
 * const options = buildOptions({ dryRun: true });
 */
function buildOptions(parsed) {
	return {
		cwd: projectRoot,
		dryRun: parsed.dryRun,
		projectName: "@cldmv/vitest-runner",
		company: "CLDMV",
		companyName: "Catalyzed Motivation Inc.",
		copyrightStartYear: 2013,
		includeExtensions: [".mjs", ".cjs", ".yml", ".yaml"],
		includeFolders: FILE_HEADER_CHECK_FOLDERS.map((f) => f.path),
		excludeFolders: FILE_HEADER_IGNORE_FOLDERS
	};
}

/**
 * Print the run result summary to stdout.
 * @param {Awaited<ReturnType<typeof fixHeaders>>} result - Result from @cldmv/fix-headers.
 * @param {{ verbose: boolean, diff: boolean, dryRun: boolean }} opts - Display options.
 * @returns {void}
 * @example
 * printSummary(result, { verbose: true, diff: false, dryRun: false });
 */
function printSummary(result, opts) {
	if (opts.dryRun) {
		console.log("🔍 DRY RUN MODE - No files will be modified\n");
	}

	if (opts.verbose || opts.diff) {
		const changed = result.changes.filter((c) => c.changed);
		if (changed.length > 0) {
			console.log("Files with changes:\n");
			for (const entry of changed) {
				console.log(`  ✓ ${entry.file}`);
			}
			console.log();
		}
	}

	console.log("📊 Statistics:");
	console.log(`  Files scanned:  ${result.filesScanned}`);
	console.log(`  Files updated:  ${result.filesUpdated}`);
	console.log();

	if (opts.dryRun && result.filesUpdated > 0) {
		console.log("✅ Dry run complete. Run without --dry-run to apply fixes.");
	} else if (result.filesUpdated > 0) {
		console.log(`✅ Fixed ${result.filesUpdated} file(s).`);
	} else {
		console.log("✅ All files have proper headers!");
	}

	console.log();
}

/**
 * Execute the compatibility wrapper.
 * @returns {Promise<void>} Resolves when all header processing is complete.
 * @example
 * await main();
 */
async function main() {
	const parsed = parseArguments(process.argv.slice(2));

	if (parsed.help) {
		showHelp();
		process.exit(0);
	}

	console.log("\n=== File Header Fixer ===\n");

	const options = buildOptions(parsed);
	const result = await fixHeaders(options);

	printSummary(result, parsed);
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
