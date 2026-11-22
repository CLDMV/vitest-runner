/**
 *
 *	@Project: @cldmv/vitest-runner
 *	@Filename: /tests/core/scratch-release.test.vitest.mjs
 *	@Date: 2026-11-21T13:26:56-08:00 (1795296416)
 *	@Author: Nate Corcoran <CLDMV>
 *	@Email: <Shinrai@users.noreply.github.com>
 *	-----
 *	@Last modified by: Nate Corcoran <CLDMV> (Shinrai@users.noreply.github.com)
 *	@Last modified time: 2026-11-21T13:26:57-08:00 (1795296417)
 *	-----
 *	@Copyright: Copyright (c) 2013-2026 Catalyzed Motivation Inc. All rights reserved.
 *
 */

/**
 * createRunScratchRoot().release() when closing the liveness socket fails (a mutex timeout or
 * an unlink error inside @cldmv/lib-process). The package is mocked, since `alive` is frozen
 * and can't be spied on.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const close = vi.fn(() => Promise.reject(new Error("simulated close failure")));

vi.mock("@cldmv/lib-process", () => ({
	alive: {
		hold: vi.fn(async () => ({ close })),
		check: vi.fn(async () => "unknown"),
		SOCKET_NAME: "alive.sock",
		MAX_SOCKET_PATH_BYTES: 107
	}
}));

const { createRunScratchRoot } = await import("../../src/core/scratch.mjs");

const TMP_ROOT = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."), "tmp", "scratch-release-tests");

afterEach(() => fs.rm(TMP_ROOT, { recursive: true, force: true }));

describe("createRunScratchRoot release()", () => {
	it("still resolves when closing the liveness socket fails", async () => {
		const { release } = await createRunScratchRoot(TMP_ROOT, "runs");
		await expect(release()).resolves.toBeUndefined();
		expect(close).toHaveBeenCalledOnce();
	});
});
