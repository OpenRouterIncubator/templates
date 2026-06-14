import { describe, expect, it } from "bun:test";
import { buildRcaPrompt, parseRca } from "./rca.ts";

describe("buildRcaPrompt", () => {
  it("includes the report and candidate snippets", () => {
    const prompt = buildRcaPrompt("crash in parseUser", [
      { path: "src/user.ts", startLine: 40, text: "const id = u.id;" },
    ]);
    expect(prompt).toContain("crash in parseUser");
    expect(prompt).toContain("src/user.ts (from line 40)");
    expect(prompt).toContain("const id = u.id;");
  });

  it("notes when no code was located", () => {
    expect(buildRcaPrompt("vague bug", [])).toContain(
      "no candidate code located"
    );
  });
});

describe("parseRca", () => {
  it("parses a full analysis and validates citations", () => {
    const rca = parseRca(
      JSON.stringify({
        citations: [
          { line: 12, note: "deref", path: "a.ts" },
          { note: "no line", path: "b.ts" },
        ],
        confidence: "high",
        fix: "guard the null",
        needsRuntime: false,
        rootCause: "u is undefined",
        summary: "null deref",
      })
    );
    expect(rca.rootCause).toBe("u is undefined");
    expect(rca.confidence).toBe("high");
    expect(rca.citations).toHaveLength(1);
    expect(rca.citations[0]?.line).toBe(12);
  });

  it("defaults safely on malformed output", () => {
    const rca = parseRca("not json");
    expect(rca.summary).toBe("");
    expect(rca.confidence).toBe("medium");
    expect(rca.citations).toEqual([]);
    expect(rca.needsRuntime).toBe(false);
  });
});
