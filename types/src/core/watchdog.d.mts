/**
 * Resolve the run-wide limits from the options and the environment.
 *
 * @param {{ timeoutMs?: unknown, idleTimeoutMs?: unknown }} [opts]
 * @param {NodeJS.ProcessEnv} [env=process.env]
 * @returns {FileTimeouts}
 */
export function resolveFileTimeouts({ timeoutMs, idleTimeoutMs }?: {
    timeoutMs?: unknown;
    idleTimeoutMs?: unknown;
}, env?: NodeJS.ProcessEnv): FileTimeouts;
/**
 * The limits for one file: the first override whose pattern matches replaces the limits it sets.
 *
 * @param {string} filePath
 * @param {FileTimeouts} defaults - Run-wide limits from {@link resolveFileTimeouts}.
 * @param {PerFileTimeoutOverride[]} [overrides=[]]
 * @returns {FileTimeouts}
 */
export function getTimeoutsForFile(filePath: string, defaults: FileTimeouts, overrides?: PerFileTimeoutOverride[]): FileTimeouts;
/**
 * Format a limit for a message: whole minutes, seconds, or milliseconds.
 *
 * @param {number} ms
 * @returns {string}
 */
export function formatLimit(ms: number): string;
/**
 * Whether children get their own process group. Windows has no process groups to kill,
 * so it keeps the old behaviour there (the kill reaches the child only).
 *
 * @returns {boolean}
 */
export function usesProcessGroups(): boolean;
/**
 * Track a child until it closes, so {@link killChildProcessGroups} can reach it.
 *
 * @param {import('node:child_process').ChildProcess} child
 * @returns {() => void} Stops tracking it.
 */
export function trackChild(child: import("node:child_process").ChildProcess): () => void;
/**
 * Send `signal` to a child's whole process group (or to the child alone on Windows).
 * A group that is already gone is not an error.
 *
 * @param {import('node:child_process').ChildProcess} child
 * @param {NodeJS.Signals} signal
 * @returns {void}
 */
export function killProcessGroup(child: import("node:child_process").ChildProcess, signal: NodeJS.Signals): void;
/**
 * Kill every live child's process group. Synchronous, so it is safe in an `exit` handler.
 *
 * @param {NodeJS.Signals} [signal='SIGKILL']
 * @returns {number} How many groups were signalled.
 */
export function killChildProcessGroups(signal?: NodeJS.Signals): number;
/**
 * How many children are live right now.
 *
 * @returns {number}
 */
export function liveChildCount(): number;
/**
 * The last `count` non-empty lines of `text`.
 *
 * @param {string} text
 * @param {number} [count=TAIL_LINES]
 * @returns {string}
 */
export function tailLines(text: string, count?: number): string;
/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /src/core/watchdog.mjs
 *	@Date: 2026-11-22T21:39:47-08:00 (1795412387)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-22T21:43:35-08:00 (1795412615)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */
/**
 * @fileoverview Per-file watchdog limits and the process groups they kill.
 *
 * Every test file runs in its own child process, started in its own process group
 * (POSIX) so that a kill reaches vitest's workers and anything a test started (a
 * browser, a server) along with it. A file is killed when it runs longer than its
 * time limit, or goes longer than its idle limit without printing anything. The
 * runner then reports it as failed and carries on with the rest of the run.
 *
 * Because the children are no longer in the terminal's process group, Ctrl-C does not
 * reach them on its own: the runner kills every live group on SIGINT/SIGTERM and on exit
 * ({@link killChildProcessGroups}).
 *
 * @module vitest-runner/src/core/watchdog
 */
/** Default limit on how long one file may run: 30 minutes. */
export const DEFAULT_FILE_TIMEOUT_MS: number;
/** Default limit on how long one file may go without printing anything: 10 minutes. */
export const DEFAULT_FILE_IDLE_TIMEOUT_MS: number;
/** Env var for the per-file time limit, in seconds (`0` = no limit). */
export const FILE_TIMEOUT_ENV: "VITEST_FILE_TIMEOUT";
/** Env var for the per-file idle limit, in seconds (`0` = no limit). */
export const FILE_IDLE_TIMEOUT_ENV: "VITEST_FILE_IDLE_TIMEOUT";
/** How long a killed file gets between SIGTERM and SIGKILL. */
export const KILL_GRACE_MS: 5000;
/** Lines of a killed file's output included in its failure message. */
export const TAIL_LINES: 20;
export type PerFileTimeoutOverride = {
    /**
     * - Substring matched against the normalised file path.
     */
    pattern: string;
    /**
     * - Time limit for matching files (`0` = no limit).
     */
    timeoutMs?: number;
    /**
     * - Idle limit for matching files (`0` = no limit).
     */
    idleTimeoutMs?: number;
};
export type FileTimeouts = {
    /**
     * - Time limit in ms; `0` = no limit.
     */
    timeoutMs: number;
    /**
     * - Idle limit in ms; `0` = no limit.
     */
    idleTimeoutMs: number;
};
