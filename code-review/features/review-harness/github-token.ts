// Resolve a GitHub token without forcing the user to export one. Tries, in
// order: the environment, the GitHub CLI (`gh auth token`), then the git
// credential helper (`git credential fill`). So PR review works for anyone
// already signed in with gh or git. All shell-outs fail soft to undefined.
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const TIMEOUT_MS = 5000;
const PASSWORD_LINE = /(?:^|\n)password=(.+)/;

export async function resolveGitHubToken(
  env: Record<string, string | undefined>
): Promise<string | undefined> {
  return fromEnv(env) ?? (await ghCliToken()) ?? (await gitCredentialToken());
}

function fromEnv(env: Record<string, string | undefined>): string | undefined {
  for (const key of ["GITHUB_TOKEN", "GH_TOKEN"]) {
    const value = env[key];
    if (value !== undefined && value.trim().length > 0) {
      return value.trim();
    }
  }
  return;
}

async function ghCliToken(): Promise<string | undefined> {
  try {
    const { stdout } = await run("gh", ["auth", "token"], {
      timeout: TIMEOUT_MS,
    });
    const token = stdout.trim();
    return token.length > 0 ? token : undefined;
  } catch {
    return;
  }
}

// Ask git's configured credential helper for a github.com password/token.
function gitCredentialToken(): Promise<string | undefined> {
  return new Promise((resolve) => {
    const child = spawn("git", ["credential", "fill"], {
      stdio: ["pipe", "pipe", "ignore"],
    });
    let output = "";
    let settled = false;
    const settle = (value: string | undefined) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    // A blocking or prompting credential helper would otherwise hang PR review
    // forever, so bound it like ghCliToken does.
    const timer = setTimeout(() => {
      child.kill();
      settle(undefined);
    }, TIMEOUT_MS);
    child.stdout?.on("data", (chunk) => {
      output += String(chunk);
    });
    child.on("error", () => settle(undefined));
    child.on("close", () => {
      const match = PASSWORD_LINE.exec(output);
      settle(match?.[1]?.trim() || undefined);
    });
    if (child.stdin === null) {
      child.kill();
      settle(undefined);
      return;
    }
    child.stdin.write("protocol=https\nhost=github.com\n\n");
    child.stdin.end();
  });
}
