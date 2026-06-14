import { describe, expect, it } from "bun:test";
import { checkStyle, formatReport } from "./style.ts";

describe("checkStyle", () => {
  it("flags AI-filler phrases with line numbers", () => {
    const report = checkStyle("Good line.\nLet's delve into the tapestry.");
    const messages = report.findings.map((f) => f.message).join(" ");
    expect(report.ok).toBe(false);
    expect(messages).toContain("delve");
    expect(messages).toContain("tapestry");
    expect(report.findings[0]?.line).toBe(2);
  });

  it("warns on em-dash overuse without failing", () => {
    const report = checkStyle("one — two — three — four — five words here");
    expect(report.ok).toBe(true);
    expect(
      report.findings.some((f) => f.message.includes("em-dash density"))
    ).toBe(true);
  });

  it("warns on hedging density", () => {
    const report = checkStyle(
      "It might work. Perhaps it could possibly help, arguably."
    );
    expect(
      report.findings.some((f) => f.message.includes("hedging density"))
    ).toBe(true);
  });

  it("warns on exclamation overload", () => {
    const report = checkStyle("Wow! Amazing! Incredible!");
    expect(report.findings.some((f) => f.message.includes("exclamation"))).toBe(
      true
    );
  });

  it("passes plain, concrete prose", () => {
    const report = checkStyle(
      "Preview deploys cut our review time from two days to four hours. Here is the exact setup we used."
    );
    expect(report.ok).toBe(true);
    expect(report.findings).toEqual([]);
  });
});

describe("formatReport", () => {
  it("renders a clean pass", () => {
    expect(formatReport(checkStyle("Plain and specific."))).toContain(
      "Reads human"
    );
  });

  it("renders errors with a failing verdict", () => {
    expect(formatReport(checkStyle("We delve deep."))).toContain("FAILED");
  });
});
