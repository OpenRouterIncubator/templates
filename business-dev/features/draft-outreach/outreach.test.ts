import { describe, expect, it } from "bun:test";
import {
  cardMentionTokens,
  checkDraft,
  countWords,
  parseDraftData,
  renderDraft,
} from "./outreach.ts";

describe("checkDraft", () => {
  const personalized = {
    subject: "Acme's backend hiring",
    body: "Saw Acme is hiring 5 backend engineers. Teams that scale fast usually hit routing pain early — open to a quick look at how we'd help?",
  };

  it("passes a personalized, concise, CTA-bearing draft", () => {
    expect(checkDraft(personalized, ["acme", "backend"])).toEqual([]);
  });

  it("flags clichés", () => {
    const issues = checkDraft(
      {
        subject: "Hi",
        body: "I hope this email finds you well. Acme rocks. Worth a chat?",
      },
      ["acme"]
    );
    expect(issues.some((i) => i.kind === "cliche")).toBe(true);
  });

  it("flags missing personalization and missing CTA", () => {
    const issues = checkDraft(
      {
        subject: "Intro",
        body: "We are a revolutionary platform for everyone.",
      },
      ["acme"]
    );
    expect(issues.some((i) => i.kind === "not-personalized")).toBe(true);
    expect(issues.some((i) => i.kind === "no-cta")).toBe(true);
  });
});

describe("cardMentionTokens", () => {
  const card =
    "---\nname: Jane Doe\ncompany: Acme Corp\nrole: CTO\n---\n\n# Research: Jane Doe — Acme Corp";

  it("extracts the card's name and company as default mention tokens", () => {
    expect(cardMentionTokens(card)).toEqual(["Jane Doe", "Acme Corp"]);
  });

  it("returns nothing for content without frontmatter", () => {
    expect(cardMentionTokens("# hand-written notes")).toEqual([]);
  });

  it("makes a generic draft fail the gate on a default run", () => {
    const generic = {
      subject: "Quick intro",
      body: "We build great tooling for fast-growing teams. Worth a chat?",
    };
    const issues = checkDraft(generic, [...cardMentionTokens(card)]);
    expect(issues.some((i) => i.kind === "not-personalized")).toBe(true);
  });
});

describe("parseDraftData / renderDraft / countWords", () => {
  it("parses and renders", () => {
    const draft = parseDraftData(JSON.stringify({ subject: "S", body: "B" }));
    expect(renderDraft(draft)).toContain("Subject: S");
  });

  it("defaults safely on bad json", () => {
    expect(parseDraftData("x").subject).toBe("");
  });

  it("counts words", () => {
    expect(countWords("  one  two three ")).toBe(3);
  });
});
