import { describe, expect, it } from "bun:test";
import { applyEdits, parseEdits, renderRedline } from "./redline.ts";

const DOC =
  "1. Liability is unlimited. 2. Either party may terminate at will. 3. Governing law: somewhere.";

const EDITS = parseEdits(
  JSON.stringify({
    edits: [
      {
        original: "Liability is unlimited.",
        proposed: "Liability is capped at fees paid in the prior 12 months.",
        rationale: "uncapped liability",
        severity: "critical",
      },
      {
        original: "Either party may terminate at will.",
        proposed: "",
        rationale: "termination needs 30-day notice",
        severity: "high",
      },
      {
        original: "This sentence is not in the document.",
        proposed: "x",
        rationale: "paraphrased anchor",
        severity: "low",
      },
    ],
  })
);

describe("parseEdits", () => {
  it("parses edits and coerces bad severities", () => {
    const edits = parseEdits(
      JSON.stringify({
        edits: [{ original: "a", proposed: "b", severity: "spicy" }],
      })
    );
    expect(edits[0]?.severity).toBe("medium");
  });

  it("skips edits without original text", () => {
    const edits = parseEdits(
      JSON.stringify({ edits: [{ proposed: "b" }, { original: " " }] })
    );
    expect(edits).toEqual([]);
  });

  it("throws on malformed or empty output instead of reporting zero edits", () => {
    expect(() => parseEdits("nope")).toThrow("not valid edits JSON");
    expect(() => parseEdits("")).toThrow("empty response");
  });
});

describe("applyEdits", () => {
  it("marks replacements and deletions, and reports unanchored edits", () => {
    const result = applyEdits(DOC, EDITS);
    expect(result.marked).toContain(
      "~~Liability is unlimited.~~ **Liability is capped at fees paid in the prior 12 months.**"
    );
    expect(result.marked).toContain("~~Either party may terminate at will.~~");
    expect(result.marked).not.toContain("**x**");
    expect(result.applied).toHaveLength(2);
    expect(result.unanchored).toHaveLength(1);
  });

  it("renders $-sequences in proposed text verbatim", () => {
    const proposed = "Liability is capped at $100,000 ($$, $&, $` and $').";
    const edits = parseEdits(
      JSON.stringify({
        edits: [
          {
            original: "Liability is unlimited.",
            proposed,
            rationale: "cap liability",
            severity: "critical",
          },
        ],
      })
    );
    const result = applyEdits(DOC, edits);
    expect(result.marked).toContain(`**${proposed}**`);
  });
});

describe("renderRedline", () => {
  it("renders markup, rationale, and the manual section", () => {
    const md = renderRedline("msa.txt", applyEdits(DOC, EDITS));
    expect(md).toContain("# Redline: msa.txt");
    expect(md).toContain("[CRITICAL]");
    expect(md).toContain("(delete)");
    expect(md).toContain("## Could not anchor");
    expect(md).toContain("not legal advice");
  });

  it("says so when no edits are proposed", () => {
    const md = renderRedline("nda.txt", applyEdits(DOC, []));
    expect(md).toContain("No edits proposed.");
    expect(md).not.toContain("## Could not anchor");
  });
});
