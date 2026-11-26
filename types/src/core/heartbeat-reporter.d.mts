/** Env var naming the file descriptor the heartbeat is written to. */
export const HEARTBEAT_FD_ENV: "VITEST_RUNNER_HEARTBEAT_FD";
/** Minimum gap between two heartbeats, in ms. */
export const HEARTBEAT_INTERVAL_MS: 1000;
/**
 * Writes a heartbeat to the runner's pipe on reporter events.
 * @example
 * // vitest run --reporter=default --reporter=/abs/path/heartbeat-reporter.mjs
 */
export default class HeartbeatReporter {
    /**
     * Vitest passes the reporter's options (unused) as the first argument.
     * @param {unknown} [_options]
     * @param {{ env?: NodeJS.ProcessEnv, now?: () => number }} [deps] - Overrides for tests.
     */
    constructor(_options?: unknown, { env, now }?: {
        env?: NodeJS.ProcessEnv;
        now?: () => number;
    });
    fd: number;
    now: () => number;
    last: number;
    /**
     * Write one heartbeat unless one went out within the interval.
     * @returns {void}
     */
    beat(): void;
}
