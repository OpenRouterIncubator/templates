import { describe, expect, it } from "bun:test";
import { candidateEmails, normalizeDomain, parseName } from "./patterns.ts";

describe("parseName", () => {
  it("lowercases and strips punctuation, keeping first + last", () => {
    expect(parseName("  Jane Q. O'Brien ")).toEqual({
      first: "jane",
      last: "obrien",
    });
  });

  it("rejects single-word names", () => {
    expect(parseName("Cher")).toBeNull();
    expect(parseName("   ")).toBeNull();
  });
});

describe("normalizeDomain", () => {
  it("strips scheme, www, and paths", () => {
    expect(normalizeDomain("https://www.Acme.com/about")).toBe("acme.com");
    expect(normalizeDomain("acme.com")).toBe("acme.com");
  });
});

describe("candidateEmails", () => {
  it("generates the common patterns, most-likely first, deduped", () => {
    const emails = candidateEmails({ first: "jane", last: "doe" }, "acme.com");
    expect(emails[0]).toBe("jane.doe@acme.com");
    expect(emails).toContain("jdoe@acme.com");
    expect(emails).toContain("jane@acme.com");
    expect(new Set(emails).size).toBe(emails.length);
    expect(emails.every((e) => e.endsWith("@acme.com"))).toBe(true);
  });
});
