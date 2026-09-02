import { describe, expect, it } from "bun:test";
import { EventEmitter } from "node:events";

import { type ChildProcessEdge, resolveGitHubToken } from "./github-token.ts";

// The process edge is injected, so these fakes are passed straight in. Nothing
// here mocks `node:child_process`: that mock is process-global and replaces the
// module for every suite, which is how `execFileSync` went missing from
// local-diff.test.ts and pipeline.test.ts. See `ChildProcessEdge`.

class FakeStdin {
  written = "";
  ended = false;
  write(chunk: string) {
    this.written += chunk;
  }
  end() {
    this.ended = true;
  }
}

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stdin: FakeStdin | null = new FakeStdin();
  killed = false;
  kill() {
    this.killed = true;
  }
}

/** An edge whose `gh auth token` call resolves with the given stdout. */
function ghResolves(stdout: string): ChildProcessEdge["runCommand"] {
  return () => Promise.resolve({ stdout });
}

/** An edge whose `gh auth token` call rejects, as when gh is not installed. */
function ghRejects(): ChildProcessEdge["runCommand"] {
  return () => Promise.reject(new Error("gh not installed"));
}

function edgeOf(
  runCommand: ChildProcessEdge["runCommand"],
  child: FakeChild,
  drive: (child: FakeChild) => void = () => undefined
): ChildProcessEdge {
  return {
    runCommand,
    startCommand: () => {
      drive(child);
      return child;
    },
  };
}

describe("resolveGitHubToken", () => {
  it("returns a GITHUB_TOKEN from the environment without shelling out", async () => {
    // No edge passed, so this also covers the default wiring to node's own
    // child_process: an env hit must never reach it.
    await expect(
      resolveGitHubToken({ GITHUB_TOKEN: "  env-token  " })
    ).resolves.toBe("env-token");
  });

  it("falls back to GH_TOKEN when GITHUB_TOKEN is missing", async () => {
    await expect(
      resolveGitHubToken({ GH_TOKEN: "gh-env-token" })
    ).resolves.toBe("gh-env-token");
  });

  it("ignores blank env values and uses the gh CLI token", async () => {
    const edge = edgeOf(ghResolves("cli-token\n"), new FakeChild());

    await expect(
      resolveGitHubToken({ GITHUB_TOKEN: "   ", GH_TOKEN: "" }, edge)
    ).resolves.toBe("cli-token");
  });

  it("treats empty gh CLI output as no token and falls through to git", async () => {
    const child = new FakeChild();
    // The module attaches its listeners synchronously in the promise executor
    // that runs before startCommand returns, so drive the child from a
    // microtask scheduled as it is handed over.
    const edge = edgeOf(ghResolves("   \n"), child, (spawned) => {
      queueMicrotask(() => {
        spawned.stdout.emit("data", "protocol=https\nhost=github.com\n");
        spawned.stdout.emit("data", "username=x\npassword=git-token\n");
        spawned.emit("close");
      });
    });

    await expect(resolveGitHubToken({}, edge)).resolves.toBe("git-token");
    expect(child.stdin?.written).toBe("protocol=https\nhost=github.com\n\n");
    expect(child.stdin?.ended).toBe(true);
  });

  it("falls through to git credential when the gh CLI errors", async () => {
    const child = new FakeChild();
    const edge = edgeOf(ghRejects(), child, (spawned) => {
      queueMicrotask(() => {
        spawned.stdout.emit("data", "password=fallback-token\n");
        spawned.emit("close");
      });
    });

    await expect(resolveGitHubToken({}, edge)).resolves.toBe("fallback-token");
  });

  it("returns undefined when git credential output has no password", async () => {
    const child = new FakeChild();
    const edge = edgeOf(ghRejects(), child, (spawned) => {
      queueMicrotask(() => {
        spawned.stdout.emit("data", "protocol=https\nhost=github.com\n");
        spawned.emit("close");
      });
    });

    await expect(resolveGitHubToken({}, edge)).resolves.toBeUndefined();
  });

  it("returns undefined when the git credential process errors", async () => {
    const child = new FakeChild();
    const edge = edgeOf(ghRejects(), child, (spawned) => {
      queueMicrotask(() => spawned.emit("error", new Error("spawn ENOENT")));
    });

    await expect(resolveGitHubToken({}, edge)).resolves.toBeUndefined();
  });

  it("ignores a late close after an error (single settle)", async () => {
    const child = new FakeChild();
    const edge = edgeOf(ghRejects(), child, (spawned) => {
      queueMicrotask(() => {
        spawned.emit("error", new Error("boom"));
        // A close arriving after the error must not change the resolved value.
        spawned.stdout.emit("data", "password=ignored\n");
        spawned.emit("close");
      });
    });

    await expect(resolveGitHubToken({}, edge)).resolves.toBeUndefined();
  });

  it("resolves undefined and kills the child when stdin is unavailable", async () => {
    const child = new FakeChild();
    child.stdin = null;
    const edge = edgeOf(ghRejects(), child);

    await expect(resolveGitHubToken({}, edge)).resolves.toBeUndefined();
    expect(child.killed).toBe(true);
  });

  it("kills the child and resolves undefined when it never closes (timeout)", async () => {
    // Never emit close/error; let the bounding timer fire to settle undefined.
    const child = new FakeChild();
    const edge = edgeOf(ghRejects(), child);

    const realSetTimeout = globalThis.setTimeout;
    // Fire the bounding timer on a later microtask (after the executor finishes
    // assigning `timer`) instead of waiting the real TIMEOUT_MS.
    globalThis.setTimeout = ((fn: () => void) => {
      queueMicrotask(fn);
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;

    try {
      await expect(resolveGitHubToken({}, edge)).resolves.toBeUndefined();
      expect(child.killed).toBe(true);
    } finally {
      globalThis.setTimeout = realSetTimeout;
    }
  });
});
