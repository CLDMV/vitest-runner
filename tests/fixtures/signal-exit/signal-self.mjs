/**
 * Tiny stand-in "vitest binary" used by spawn tests to trigger a signal-based
 * (null exit-code) child-process termination.
 *
 * When Node runs this file it immediately sends SIGTERM to itself.  The OS
 * terminates the process with a signal, so the close event fires with
 * `code = null` — exercising the `code ?? 1` fallback branches in spawn.mjs.
 */
process.kill(process.pid, "SIGTERM");
