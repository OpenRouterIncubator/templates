import { describe, expect, it } from "bun:test";
import { approvalGate, buildDraftPrompt } from "./draft.ts";

const APPROVED = [
  "---",
  "topic: t",
  "audience: a",
  "intent: i",
  "angle: g",
  "thesis: th",
  "cta: c",
  "status: approved",
  "---",
  "body",
].join("\n");
const DRAFT = APPROVED.replace("status: approved", "status: draft");
const APPROVED_INCOMPLETE = "---\ntopic: t\nstatus: approved\n---\nbody";

describe("approvalGate", () => {
  it("passes an approved brief", () => {
    expect(approvalGate(APPROVED).ok).toBe(true);
  });

  it("refuses an unapproved brief with the reason", () => {
    const gate = approvalGate(DRAFT);
    expect(gate.ok).toBe(false);
    expect(gate.reason).toContain("status: draft");
  });

  it("refuses non-brief content", () => {
    expect(approvalGate("# plain markdown").ok).toBe(false);
  });

  it("refuses a hand-approved brief that is missing required fields", () => {
    const gate = approvalGate(APPROVED_INCOMPLETE);
    expect(gate.ok).toBe(false);
    expect(gate.reason).toContain("incomplete");
    expect(gate.reason).toContain("thesis");
  });
});

describe("buildDraftPrompt", () => {
  it("embeds the brief and the voice constraints", () => {
    const prompt = buildDraftPrompt(APPROVED);
    expect(prompt).toContain("Approved brief");
    expect(prompt).toContain("status: approved");
    expect(prompt).toContain("human voice");
  });
});
