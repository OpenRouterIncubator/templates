import { afterEach, describe, expect, it, mock } from "bun:test";
import { EventEmitter } from "node:events";

// `github-token.ts` captures `promisify(execFile)` and `spawn` at import time,
// so the child_process mock must be installed before the module is imported.
// Each test drives the fakes synchronously to exercise the gh + git paths
// without spawning real processes or touching the network.

type ExecFileCallback = (
  error: Error | null,
  result: { stdout: string; stderr: string }
) => void;

let execFileImpl: (
  file: string,
  args: string[],
  options: unknown,
  callback: ExecFileCallback
) => void;

let spawnImpl: (file: string, args: string[], options: unknown) => FakeChild;

mock.module("node:child_process", () => ({
  execFile: (
    file: string,
    args: string[],
    options: unknown,
    callback: ExecFileCallback
  ) => execFileImpl(file, args, options, callback),
  spawn: (file: string, args: string[], options: unknown) =>
    spawnImpl(file, args, options),
}));

// `github-token.ts` binds `promisify(execFile)` and `spawn` at module-eval
// time. Other suites (e.g. pipeline.test.ts) import it transitively before
// this file runs, so it is already cached against the real child_process. A
// query-string specifier forces a fresh evaluation that picks up the mock
// above regardless of import order.
const { resolveGitHubToken } = (await import(
  `./github-token.ts?mock=${Date.now()}`
)) as typeof import("./github-token.ts");

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

/** Make `promisify(execFile)` resolve with the given stdout. */
function execFileResolves(stdout: string) {
  execFileImpl = (_file, _args, _options, callback) => {
    callback(null, { stdout, stderr: "" });
  };
}

/** Make `promisify(execFile)` reject. */
function execFileRejects() {
  execFileImpl = (_file, _args, _options, callback) => {
    callback(new Error("gh not installed"), { stdout: "", stderr: "" });
  };
}

afterEach(() => {
  mock.restore();
});

describe("resolveGitHubToken", () => {
  it("returns a GITHUB_TOKEN from the environment without shelling out", async () => {
    execFileImpl = () => {
      throw new Error("should not be called");
    };
    spawnImpl = () => {
      throw new Error("should not be called");
    };

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
    execFileResolves("cli-token\n");

    await expect(
      resolveGitHubToken({ GITHUB_TOKEN: "   ", GH_TOKEN: "" })
    ).resolves.toBe("cli-token");
  });

  it("treats empty gh CLI output as no token and falls through to git", async () => {
    execFileResolves("   \n");

    const child = new FakeChild();
    // The module calls spawn only after awaiting the gh CLI, so drive the fake
    // child from inside spawnImpl — its listeners are attached synchronously in
    // the promise executor that runs before spawn returns.
    spawnImpl = () => {
      queueMicrotask(() => {
        child.stdout.emit("data", "protocol=https\nhost=github.com\n");
        child.stdout.emit("data", "username=x\npassword=git-token\n");
        child.emit("close");
      });
      return child;
    };

    await expect(resolveGitHubToken({})).resolves.toBe("git-token");
    expect(child.stdin?.written).toBe("protocol=https\nhost=github.com\n\n");
    expect(child.stdin?.ended).toBe(true);
  });

  it("falls through to git credential when the gh CLI errors", async () => {
    execFileRejects();

    const child = new FakeChild();
    spawnImpl = () => {
      queueMicrotask(() => {
        child.stdout.emit("data", "password=fallback-token\n");
        child.emit("close");
      });
      return child;
    };

    await expect(resolveGitHubToken({})).resolves.toBe("fallback-token");
  });

  it("returns undefined when git credential output has no password", async () => {
    execFileRejects();

    const child = new FakeChild();
    spawnImpl = () => {
      queueMicrotask(() => {
        child.stdout.emit("data", "protocol=https\nhost=github.com\n");
        child.emit("close");
      });
      return child;
    };

    await expect(resolveGitHubToken({})).resolves.toBeUndefined();
  });

  it("returns undefined when the git credential process errors", async () => {
    execFileRejects();

    const child = new FakeChild();
    spawnImpl = () => {
      queueMicrotask(() => child.emit("error", new Error("spawn ENOENT")));
      return child;
    };

    await expect(resolveGitHubToken({})).resolves.toBeUndefined();
  });

  it("ignores a late close after an error (single settle)", async () => {
    execFileRejects();

    const child = new FakeChild();
    spawnImpl = () => {
      queueMicrotask(() => {
        child.emit("error", new Error("boom"));
        // A close arriving after the error must not change the resolved value.
        child.stdout.emit("data", "password=ignored\n");
        child.emit("close");
      });
      return child;
    };

    await expect(resolveGitHubToken({})).resolves.toBeUndefined();
  });

  it("resolves undefined and kills the child when stdin is unavailable", async () => {
    execFileRejects();

    const child = new FakeChild();
    child.stdin = null;
    spawnImpl = () => child;

    await expect(resolveGitHubToken({})).resolves.toBeUndefined();
    expect(child.killed).toBe(true);
  });

  it("kills the child and resolves undefined when it never closes (timeout)", async () => {
    execFileRejects();

    const child = new FakeChild();
    // Never emit close/error; let the bounding timer fire to settle undefined.
    spawnImpl = () => child;

    const realSetTimeout = globalThis.setTimeout;
    // Fire the bounding timer on a later microtask (after the executor finishes
    // assigning `timer`) instead of waiting the real TIMEOUT_MS.
    globalThis.setTimeout = ((fn: () => void) => {
      queueMicrotask(fn);
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;

    try {
      await expect(resolveGitHubToken({})).resolves.toBeUndefined();
      expect(child.killed).toBe(true);
    } finally {
      globalThis.setTimeout = realSetTimeout;
    }
  });
});
