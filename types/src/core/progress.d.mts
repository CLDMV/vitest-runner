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
export function createCoverageProgressTracker(total: number): {
    onStart: () => void;
    onComplete: (failedRun: boolean) => void;
    finish: () => void;
};
/**
 * A no-op progress tracker used when quiet mode is disabled (progress is
 * handled via `console.log` inline).
 * @type {{ onStart: () => void, onComplete: (failedRun: boolean) => void, finish: () => void }}
 */
export const noopProgressTracker: {
    onStart: () => void;
    onComplete: (failedRun: boolean) => void;
    finish: () => void;
};
