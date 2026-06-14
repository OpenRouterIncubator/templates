import { describe, expect, it } from "bun:test";
import type { ChangedFile } from "./github.ts";
import { scanSecrets } from "./security.ts";

function file(patch: string): ChangedFile {
  return {
    additions: 1,
    deletions: 0,
    filename: "src/config.ts",
    patch,
    status: "modified",
  };
}

describe("scanSecrets", () => {
  it("flags a hardcoded credential on the correct added line", () => {
    const patch = [
      "@@ -1,2 +1,3 @@",
      " const a = 1;",
      '+const apiKey = "sk-supersecretvalue123";',
      " const b = 2;",
    ].join("\n");
    const findings = scanSecrets([file(patch)]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe("must-fix");
    expect(findings[0]?.line).toBe(2);
  });

  it("ignores secrets on removed or context lines", () => {
    const patch = [
      "@@ -1,2 +1,1 @@",
      '-const ghp = "ghp_EXAMPLEEXAMPLEEXAMPLEEXAMPLEEXAMPLE";',
      " keep();",
    ].join("\n");
    expect(scanSecrets([file(patch)])).toEqual([]);
  });

  it("returns nothing for a clean diff or a file with no patch", () => {
    const clean = "@@ -1,1 +1,1 @@\n+const x = 1;";
    expect(scanSecrets([file(clean)])).toEqual([]);
    expect(
      scanSecrets([
        { additions: 0, deletions: 0, filename: "a", status: "renamed" },
      ])
    ).toEqual([]);
  });
});
