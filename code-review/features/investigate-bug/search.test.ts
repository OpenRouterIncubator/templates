import { describe, expect, it } from "bun:test";
import { extractSearchTerms } from "./search.ts";

describe("extractSearchTerms", () => {
  it("keeps identifiers and quoted phrases, drops generic words", () => {
    const terms = extractSearchTerms(
      "TypeError when parseUser() reads 'profile.id' but the value is undefined"
    );
    expect(terms).toContain("parseUser");
    expect(terms).toContain("profile.id");
    expect(terms).toContain("TypeError");
    expect(terms).not.toContain("when");
    expect(terms).not.toContain("the");
  });

  it("dedupes case-insensitively", () => {
    const terms = extractSearchTerms("Cache cache CACHE miss in getCache");
    expect(terms.filter((t) => t.toLowerCase() === "cache")).toHaveLength(1);
  });

  it("returns nothing useful for vague reports", () => {
    expect(extractSearchTerms("it is not ok")).toEqual([]);
  });
});
