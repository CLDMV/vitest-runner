# vitest-runner

Sequential Vitest runner that spawns each test file in its own child process to avoid out-of-memory crashes in large test suites.

- Runs files one-at-a-time or in a configurable parallel worker pool
- Supports full coverage mode via blob-per-file + `--mergeReports` (no OOM)
- Auto-detects your vitest config; accepts an explicit path if needed
- All standard Vitest CLI flags are forwarded unchanged
- Usable as a **CLI binary** or as a **programmatic Node.js API**
- Pure ESM with a CJS shim for `require()` compatibility

---

## Requirements

- Node.js ≥ 18
- `vitest` ≥ 1.0 (peer dependency, installed in your project)
- `chalk` (bundled dependency — no action needed)

---

## Installation

```sh
npm install --save-dev vitest-runner
```

Or to use the CLI globally:

```sh
npm install -g vitest-runner
```

---

## CLI usage

```sh
vitest-runner [OPTIONS] [PATTERNS...]
```

### Runner flags

| Flag | Description |
|------|-------------|
| `--test-list <file>` | Run only the files listed in a JSON array file instead of scanning |
| `--file-pattern <regex>` | Override the file discovery regex (default: `\.test\.vitest\.(?:js\|mjs\|cjs)$`) |
| `--workers <n>` | Number of parallel workers (default: `4` or `VITEST_WORKERS`) |
| `--solo-pattern <pat>` | Run files matching this path substring solo (one at a time) before the worker pool; repeatable |
| `--no-error-details` | Hide inline error blocks — show only counts in the summary |
| `--coverage-quiet` | Implies `--coverage`; suppress per-file output and show only a live progress bar and final summaries |
| `--log-file <path>` | Write a clean (ANSI-stripped) copy of all output to this file; implies `--coverage-quiet` when set without it. Defaults to `coverage/coverage-run.log` when `--coverage-quiet` is active |
| `--help`, `-h` | Print this help and exit |

### Test patterns

Patterns are resolved against `cwd`. Any of the following forms work:

```sh
# Absolute or relative file path
vitest-runner src/tests/config/background.test.vitest.mjs

# Partial path or filename — matched against all discovered test files
vitest-runner background.test.vitest.mjs
vitest-runner config/background.test.vitest.mjs

# Directory — all test files inside it are run
vitest-runner src/tests/metadata
```

Multiple patterns can be combined:

```sh
vitest-runner src/tests/config src/tests/metadata
```

### Vitest passthrough flags

All unrecognised flags are forwarded verbatim to every vitest child process:

```sh
vitest-runner --reporter=verbose
vitest-runner -t "lazy materialization"
vitest-runner --coverage
vitest-runner --bail
```

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITEST_HEAP_MB` | *(none)* | `--max-old-space-size` ceiling passed to every child process |
| `VITEST_WORKERS` | `4` | Maximum parallel worker slots in the non-solo phase (overridden by `--workers`) |

### Examples

```sh
# Run all test files discovered under the default testDir
vitest-runner

# Run all tests, filter by name
vitest-runner -t "should handle null input"

# Run a specific folder
vitest-runner src/tests/auth

# Run with coverage (blob + merge — OOM-safe)
vitest-runner --coverage

# Coverage with quiet output and live progress bar (ideal for CI)
vitest-runner --coverage --coverage-quiet

# Run only files listed in a JSON file
vitest-runner --test-list my-tests.json

# Use a custom file discovery pattern
vitest-runner --file-pattern '\.spec\.ts$'

# Run 2 workers, with certain files running solo first
vitest-runner --workers 2 --solo-pattern heavy/ --solo-pattern listener-cleanup/

# Custom heap and worker count
VITEST_HEAP_MB=8192 vitest-runner --workers 2 src/tests/heavy

# Suppress error details in the summary
vitest-runner --no-error-details
```

---

## Programmatic API

```js
import { run } from 'vitest-runner';

// CommonJS
const { run } = await require('vitest-runner');
```

### `run(options)` → `Promise<number>`

Runs the test suite and resolves with an exit code (`0` = all passed, `1` = any failure). Does **not** call `process.exit` — that is the caller's responsibility.

```js
import { run } from 'vitest-runner';

const code = await run({
  cwd: process.cwd(),
  testDir: 'src/tests',
});

process.exit(code);
```

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cwd` | `string` | **required** | Absolute project root directory |
| `testDir` | `string` | `cwd` | Directory (absolute or relative to `cwd`) to scan for `*.test.vitest.{js,mjs}` files |
| `vitestConfig` | `string` | auto-detect | Explicit vitest config path; when omitted the runner walks standard config names (`vitest.config.ts`, `vite.config.ts`, etc.) relative to `cwd` |
| `testPatterns` | `string[]` | `[]` | File / folder patterns to filter — empty means all files in `testDir` |
| `testListFile` | `string` | `undefined` | Path to a JSON array of test file paths; when set, scanning is skipped entirely |
| `testFilePattern` | `RegExp` | `DEFAULT_TEST_FILE_PATTERN` | Regex matched against file names during discovery (`*.test.vitest.{js,mjs,cjs}` by default) |
| `vitestArgs` | `string[]` | `[]` | Extra CLI args forwarded verbatim to every vitest invocation |
| `showErrorDetails` | `boolean` | `true` | Print inline error blocks under each failed file in the summary |
| `coverageQuiet` | `boolean` | `false` | Suppress per-file output; show only the progress bar and final summaries |
| `workers` | `number` | `4` | Maximum parallel worker slots (overrides `VITEST_WORKERS`) |
| `worstCoverageCount` | `number` | `10` | Rows in the worst-coverage table after a coverage run (`0` disables it) |
| `maxOldSpaceMb` | `number` | `undefined` | Global `--max-old-space-size` ceiling in MB (overrides `VITEST_HEAP_MB`) |
| `earlyRunPatterns` | `string[]` | `[]` | Path substrings — matching files run solo (one at a time) before the parallel worker pool starts |
| `perFileHeapOverrides` | `PerFileHeapOverride[]` | `[]` | Per-file minimum heap ceilings; the maximum of this and `maxOldSpaceMb` wins |
| `conditions` | `string[]` | `[]` | Additional `--conditions` Node flags forwarded to children |
| `nodeEnv` | `string` | `'development'` | Value written to `NODE_ENV` in child processes |

#### `PerFileHeapOverride`

```ts
{ pattern: string; heapMb: number }
```

`pattern` is a substring matched against the normalised (forward-slash) file path. The first match wins and is compared against the global `maxOldSpaceMb`; the larger value is used.

#### Examples

```js
// Run all tests under src/tests/
await run({ cwd: process.cwd(), testDir: 'src/tests' });

// Run only the config and metadata suites
await run({
  cwd: process.cwd(),
  testDir: 'src/tests',
  testPatterns: ['src/tests/config', 'src/tests/metadata'],
});

// Coverage run (OOM-safe blob + merge mode)
await run({
  cwd: process.cwd(),
  testDir: 'src/tests',
  vitestArgs: ['--coverage'],
});

// Quiet coverage with live progress bar
await run({
  cwd: process.cwd(),
  testDir: 'src/tests',
  coverageQuiet: true,
});

// Give heap-heavy files a larger ceiling while keeping the global limit lower
await run({
  cwd: process.cwd(),
  testDir: 'src/tests',
  maxOldSpaceMb: 2048,
  earlyRunPatterns: ['listener-cleanup/'],
  perFileHeapOverrides: [
    { pattern: 'listener-cleanup/', heapMb: 6144 },
  ],
});
```

---

## Coverage mode

When `--coverage` (or `coverageQuiet: true`) is passed, the runner uses a blob-per-file strategy:

1. Each file receives `--coverage --reporter=blob` with its own temp output directory.
2. After all files complete, `vitest --mergeReports` combines the blobs into a single report.
3. Temporary blob and coverage-tmp directories are cleaned up automatically.

This avoids the OOM crash that occurs when a single vitest process holds coverage data for thousands of files simultaneously.

### Coverage quiet mode

`--coverage-quiet` / `coverageQuiet: true` suppresses all per-file output and renders a live progress bar instead. On completion it prints the coverage table and any failures verbosely. When running in this mode, output is also mirrored to `coverage/coverage-run.log` (CLI only) with ANSI colour codes stripped so the file is human-readable in any editor.

The log file path can be overridden with `--log-file <path>`. Passing `--log-file` alone (without `--coverage-quiet`) also enables quiet mode and log mirroring.

---

## Test list files

A test list file is a plain JSON array of test file paths (relative to `cwd`):

```json
[
  "src/tests/auth/login.test.vitest.mjs",
  "src/tests/auth/register.test.vitest.mjs",
  "src/tests/config/defaults.test.vitest.mjs"
]
```

Pass `--test-list <file>` (CLI) or `testListFile: 'path/to/list.json'` (API) to run exactly those files instead of scanning `testDir`.

---

## Test file naming

By default, the runner discovers files matching:

```
*.test.vitest.js
*.test.vitest.mjs
*.test.vitest.cjs
```

Files in `node_modules` or hidden directories (names starting with `.`) are always skipped.

The pattern can be overridden with `--file-pattern <regex>` (CLI) or the `testFilePattern` option (API):

```sh
# Match .spec.ts files instead
vitest-runner --file-pattern '\.spec\.ts$'
```

```js
await run({ cwd, testDir: 'src', testFilePattern: /\.spec\.ts$/i });
```

---

## Source layout

```
index.mjs              ← ESM entry (re-exports src/runner.mjs)
index.cjs              ← CJS shim (dynamic import of index.mjs)
bin/
  vitest-runner.mjs    ← CLI binary
src/
  runner.mjs           ← main run() API + re-exports
  utils/
    ansi.mjs           ← stripAnsi, colourPct
    duration.mjs       ← formatDuration
    env.mjs            ← buildNodeOptions
    resolve.mjs        ← resolveBin, resolveVitestConfig
  core/
    discover.mjs       ← discoverVitestFiles, sortWithPriority
    parse.mjs          ← parseVitestOutput, deduplicateErrors
    spawn.mjs          ← runSingleFile, runVitestDirect, runMergeReports
    report.mjs         ← printCoverageSummary, printMergeOutput
    progress.mjs       ← createCoverageProgressTracker
  cli/
    args.mjs           ← parseArguments
    help.mjs           ← showHelp
```

All sub-module utilities are re-exported from the root entry point, so deep imports are optional.

---

## License

MIT
