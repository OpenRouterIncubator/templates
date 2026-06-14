import { describe, expect, it } from "bun:test";
import { parseCardData, renderCard, slug } from "./research.ts";

describe("parseCardData / renderCard", () => {
  it("parses model output and separates verified facts from inferences", () => {
    const card = parseCardData(
      JSON.stringify({
        company: "Acme",
        companyFacts: ["Series B, 2025"],
        inferences: ["probably evaluating vendors"],
        name: "Jane Doe",
        role: "VP Eng",
        signals: ["hiring 5 backend roles"],
        talkingPoints: ["scaling pains"],
        unknowns: ["current stack?"],
      })
    );
    const md = renderCard(card);
    expect(md).toContain("name: Jane Doe");
    expect(md).toContain(
      "## Company facts (model-stated — confirm before use)"
    );
    expect(md).toContain("- Series B, 2025");
    expect(md).toContain("## Inferences (unverified)");
    expect(md).toContain("- probably evaluating vendors");
  });

  it("omits empty sections and defaults safely", () => {
    const card = parseCardData("nope");
    expect(card.name).toBe("");
    expect(renderCard(card)).not.toContain("## Signals");
  });
});

describe("slug", () => {
  it("builds a filesystem-safe slug", () => {
    expect(slug("Jane Doe", "Acme, Inc.")).toBe("jane-doe-acme-inc");
  });
});
