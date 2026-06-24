import { describe, expect, it } from "bun:test";

import { parseGitDiff } from "./gitdiff.ts";

const SAMPLE = `diff --git a/src/a.ts b/src/a.ts
index 1111111..2222222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,4 @@
 const x = 1;
-const y = 2;
+const y = 3;
+const z = 4;
 export { x };
diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,2 @@
+export const hello = "world";
+export const n = 1;
`;

describe("parseGitDiff", () => {
  it("splits files and counts added/removed lines", () => {
    const files = parseGitDiff(SAMPLE);
    expect(files.map((file) => file.filename)).toEqual([
      "src/a.ts",
      "src/new.ts",
    ]);

    const [modified, added] = files;
    expect(modified).toMatchObject({
      additions: 2,
      deletions: 1,
      status: "modified",
    });
    expect(added).toMatchObject({
      additions: 2,
      deletions: 0,
      status: "added",
    });
  });

  it("keeps a patch that starts at the hunk header", () => {
    const [modified] = parseGitDiff(SAMPLE);
    expect(modified?.patch?.startsWith("@@ -1,3 +1,4 @@")).toBe(true);
    expect(modified?.patch).not.toContain("+++ b/src/a.ts");
  });

  it("returns nothing for empty output", () => {
    expect(parseGitDiff("")).toEqual([]);
  });
});
