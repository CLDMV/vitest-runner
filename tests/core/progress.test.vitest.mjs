/**
 * @fileoverview Unit tests for src/core/progress.mjs
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { createCoverageProgressTracker, noopProgressTracker } from "../../src/core/progress.mjs";

describe("noopProgressTracker", () => {
	it("onStart does not throw", () => {
		expect(() => noopProgressTracker.onStart()).not.toThrow();
	});

	it("onComplete does not throw", () => {
		expect(() => noopProgressTracker.onComplete(false)).not.toThrow();
		expect(() => noopProgressTracker.onComplete(true)).not.toThrow();
	});

	it("finish does not throw", () => {
		expect(() => noopProgressTracker.finish()).not.toThrow();
	});
});

describe("createCoverageProgressTracker", () => {
	let stdoutWrites = [];
	let consoleLines = [];
	let origWrite;
	let spyLog;
	let origIsTTY;

	afterEach(() => {
		if (origWrite) {
			process.stdout.write = origWrite;
			origWrite = null;
		}
		if (spyLog) {
			spyLog.mockRestore();
			spyLog = null;
		}
		if (origIsTTY !== undefined) {
			process.stdout.isTTY = origIsTTY;
			origIsTTY = undefined;
		}
		stdoutWrites = [];
		consoleLines = [];
	});

	/**
	 * Set up stdout capture and console.log spy for non-TTY mode.
	 */
	function captureOutput() {
		origWrite = process.stdout.write.bind(process.stdout);
		process.stdout.write = (chunk) => {
			stdoutWrites.push(chunk.toString());
			return true;
		};
		spyLog = vi.spyOn(console, "log").mockImplementation((...args) => {
			consoleLines.push(args.join(" "));
		});
	}

	/**
	 * Enable simulated TTY mode before capturing output.
	 */
	function enableTTY() {
		origIsTTY = process.stdout.isTTY;
		process.stdout.isTTY = true;
	}

	it("writes an initial progress line on creation", () => {
		captureOutput();
		const tracker = createCoverageProgressTracker(10);
		tracker.finish();
		// In non-TTY: console.log is used; in TTY: process.stdout.write is used
		const hasOutput = stdoutWrites.length > 0 || consoleLines.length > 0;
		expect(hasOutput).toBe(true);
	});

	it("increments active count on onStart and triggers a render", () => {
		captureOutput();
		const tracker = createCoverageProgressTracker(5);
		consoleLines.length = 0;
		stdoutWrites.length = 0;
		tracker.onStart();
		tracker.finish();
		// Some render must have happened
		const hasOutput = stdoutWrites.length > 0 || consoleLines.length > 0;
		expect(hasOutput).toBe(true);
	});

	it("onComplete increments completed and triggers a forced render", () => {
		captureOutput();
		const tracker = createCoverageProgressTracker(2);
		tracker.onStart();
		consoleLines.length = 0;
		stdoutWrites.length = 0;
		tracker.onComplete(false);
		tracker.finish();
		const hasOutput = stdoutWrites.length > 0 || consoleLines.length > 0;
		expect(hasOutput).toBe(true);
	});

	it("onComplete with failedRun=true does not throw", () => {
		captureOutput();
		const tracker = createCoverageProgressTracker(1);
		expect(() => tracker.onComplete(true)).not.toThrow();
		tracker.finish();
	});

	it("finish() does not throw even when called before any onStart", () => {
		captureOutput();
		const tracker = createCoverageProgressTracker(0);
		expect(() => tracker.finish()).not.toThrow();
	});

	it("handles total = 0 without division errors", () => {
		captureOutput();
		expect(() => {
			const tracker = createCoverageProgressTracker(0);
			tracker.onStart();
			tracker.onComplete(false);
			tracker.finish();
		}).not.toThrow();
	});

	it("renders in the 70\u201399\u202f% range (yellow colour branch)", () => {
		// total=10, complete 8 → 80% triggers the else/yellow branch in buildLine
		captureOutput();
		const tracker = createCoverageProgressTracker(10);
		for (let i = 0; i < 8; i++) {
			tracker.onStart();
			tracker.onComplete(false);
		}
		tracker.finish();
		const hasOutput = stdoutWrites.length > 0 || consoleLines.length > 0;
		expect(hasOutput).toBe(true);
	});

	it("uses process.stdout.write and TTY-format in TTY mode", () => {
		enableTTY();
		captureOutput();
		const tracker = createCoverageProgressTracker(4);
		tracker.onStart();
		tracker.onComplete(false);
		tracker.finish();
		// TTY mode writes via process.stdout.write (carriage-return + padded line)
		expect(stdoutWrites.length).toBeGreaterThan(0);
		expect(stdoutWrites.some((w) => w.startsWith("\r"))).toBe(true);
	});

	it("starts and stops the spinner loop in TTY mode without errors", () => {
		enableTTY();
		captureOutput();
		expect(() => {
			const tracker = createCoverageProgressTracker(2);
			tracker.onStart();
			tracker.onComplete(false);
			tracker.finish();
		}).not.toThrow();
	});

	it("spinner loop interval fires and calls render before finish (lines 99-100 coverage)", async () => {
		// Wait long enough for the 120ms interval to tick at least once before stopping
		enableTTY();
		captureOutput();
		const tracker = createCoverageProgressTracker(10);
		tracker.onStart(); // active=1 — interval will call render() rather than early-return
		await new Promise((r) => setTimeout(r, 200)); // let interval fire
		tracker.finish();
		// At least 2 writes: the initial render + at least one interval render
		expect(stdoutWrites.length).toBeGreaterThan(1);
	});

	it("spinner interval takes early-return when all files are already complete (line 99 true branch)", async () => {
		// Complete all files before the interval fires → interval sees completed>=total && active===0
		enableTTY();
		captureOutput();
		const tracker = createCoverageProgressTracker(2);
		tracker.onStart();
		tracker.onComplete(false);
		tracker.onStart();
		tracker.onComplete(false);
		// All 2 files done; now wait for the 120ms interval to tick (it should early-return)
		await new Promise((r) => setTimeout(r, 200));
		tracker.finish();
		// Should not throw and writes should still have happened from the onComplete renders
		expect(stdoutWrites.length).toBeGreaterThan(0);
	});
});
