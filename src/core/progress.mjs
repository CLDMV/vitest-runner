/**
 * @fileoverview Live progress tracker for coverage runs.
 * @module vitest-runner/src/core/progress
 */

import chalk from "chalk";
import { formatDuration } from "../utils/duration.mjs";

/**
 * Create a live progress tracker that renders to stdout.
 *
 * In TTY mode a spinner + bar overwrites the current line on each update.
 * In non-TTY mode a plain-text line is printed at most once every two seconds,
 * plus once on every `onComplete` call.
 *
 * @param {number} total - Total number of files to process.
 * @returns {{ onStart: () => void, onComplete: (failedRun: boolean) => void, finish: () => void }}
 * @example
 * const progress = createCoverageProgressTracker(120);
 * progress.onStart();
 * progress.onComplete(false);
 * progress.finish();
 */
export function createCoverageProgressTracker(total) {
	const isTTY = Boolean(process.stdout.isTTY);
	const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
	const barWidth = 26;
	const startTime = Date.now();
	let completed = 0;
	let active = 0;
	let failed = 0;
	let frameIndex = 0;
	let maxLineLength = 0;
	let lastPlainLog = 0;
	let spinnerTimer = null;

	/**
	 * Build the current progress line text.
	 * @returns {string}
	 */
	function buildLine() {
		const percent = total === 0 ? 100 : (completed / total) * 100;
		const elapsedMs = Date.now() - startTime;
		const avgPerFile = completed > 0 ? elapsedMs / completed : 0;
		const etaMs = avgPerFile * Math.max(total - completed, 0);
		const filled = Math.round((percent / 100) * barWidth);
		const spinner = spinnerFrames[frameIndex % spinnerFrames.length];
		const bar = `[${"=".repeat(filled)}${"-".repeat(Math.max(0, barWidth - filled))}]`;

		let _percent = percent.toFixed(1).padStart(5);
		if (percent < 30) {
			_percent = chalk.red(_percent + "%");
		} else if (percent < 70) {
			_percent = chalk.rgb(255, 136, 0)(_percent + "%");
		} else if (percent > 99) {
			_percent = chalk.green(_percent + "%");
		} else {
			_percent = chalk.yellow(_percent + "%");
		}

		if (isTTY) {
			return `${chalk.green(spinner)} ${chalk.green(bar)} ${chalk.bold(_percent)} ${completed}/${total} | active ${active} | failed ${failed} | ETA ${formatDuration(etaMs)} | elapsed ${formatDuration(elapsedMs)}`;
		}

		return `progress ${percent.toFixed(1)}% ${completed}/${total} | active ${active} | failed ${failed} | eta ${formatDuration(etaMs)} | elapsed ${formatDuration(elapsedMs)}`;
	}

	/**
	 * Render the progress line to stdout.
	 * @param {boolean} [forcePlainLog=false] - Force a plain log line in non-TTY mode.
	 * @returns {void}
	 */
	function render(forcePlainLog = false) {
		const line = buildLine();
		frameIndex++;

		if (isTTY) {
			// eslint-disable-next-line no-control-regex
			const visibleLength = line.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "").length;
			maxLineLength = Math.max(maxLineLength, visibleLength);
			process.stdout.write(`\r${line.padEnd(maxLineLength, " ")}`);
			return;
		}

		const now = Date.now();
		if (forcePlainLog || now - lastPlainLog >= 2000) {
			console.log(line);
			lastPlainLog = now;
		}
	}

	/**
	 * Start the periodic spinner redraw for TTY output.
	 * @returns {void}
	 */
	function startSpinnerLoop() {
		if (!isTTY || spinnerTimer) return;
		spinnerTimer = setInterval(() => {
			if (completed >= total && active === 0) return;
			render();
		}, 120);
		spinnerTimer.unref?.();
	}

	/**
	 * Stop the periodic spinner redraw loop.
	 * @returns {void}
	 */
	function stopSpinnerLoop() {
		if (!spinnerTimer) return;
		clearInterval(spinnerTimer);
		spinnerTimer = null;
	}

	render(true);
	startSpinnerLoop();

	return {
		/**
		 * Call when a file run starts (increments active count).
		 * @returns {void}
		 */
		onStart() {
			active++;
			render();
		},

		/**
		 * Call when a file run completes.
		 * @param {boolean} failedRun - Whether the run exited with a non-zero code.
		 * @returns {void}
		 */
		onComplete(failedRun) {
			active = Math.max(0, active - 1);
			completed++;
			if (failedRun) failed++;
			render(true);
		},

		/**
		 * Stop the spinner and print the final progress line.
		 * @returns {void}
		 */
		finish() {
			stopSpinnerLoop();
			render(true);
			if (isTTY) process.stdout.write("\n");
		}
	};
}

/**
 * A no-op progress tracker used when quiet mode is disabled (progress is
 * handled via `console.log` inline).
 * @type {{ onStart: () => void, onComplete: (failedRun: boolean) => void, finish: () => void }}
 */
export const noopProgressTracker = {
	/** @returns {void} */
	onStart() {},
	/** @param {boolean} _failedRun @returns {void} */
	onComplete(_failedRun) {},
	/** @returns {void} */
	finish() {}
};
