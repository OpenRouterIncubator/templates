import { describe, expect, it } from "bun:test";
import { buildSearchQuery, hasScope, parseSearchArgs } from "./search.ts";

const NOW = new Date("2026-01-31T00:00:00Z");

describe("parseSearchArgs", () => {
  it("parses flags and defaults the window", () => {
    const opts = parseSearchArgs(["--repo", "acme/widgets", "--author", "kit"]);
    expect(opts.repo).toBe("acme/widgets");
    expect(opts.author).toBe("kit");
    expect(opts.sinceDays).toBe(30);
  });

  it("only accepts valid states", () => {
    expect(parseSearchArgs(["--state", "open"]).state).toBe("open");
    expect(parseSearchArgs(["--state", "bogus"]).state).toBeUndefined();
  });

  it("skips an unknown flag without consuming the next flag", () => {
    const opts = parseSearchArgs(["--unknown", "x", "--repo", "acme/y"]);
    expect(opts.repo).toBe("acme/y");
  });

  it("parses org, reviewer, involves, and since flags", () => {
    const opts = parseSearchArgs([
      "--org",
      "acme",
      "--reviewer",
      "kit",
      "--involves",
      "ada",
      "--since",
      "14",
    ]);
    expect(opts.org).toBe("acme");
    expect(opts.reviewer).toBe("kit");
    expect(opts.involves).toBe("ada");
    expect(opts.sinceDays).toBe(14);
  });
});

describe("hasScope", () => {
  it("requires org or repo", () => {
    expect(hasScope({ sinceDays: 30 })).toBe(false);
    expect(hasScope({ org: "acme", sinceDays: 30 })).toBe(true);
  });
});

describe("buildSearchQuery", () => {
  it("scopes by repo, role, and time window", () => {
    const query = buildSearchQuery(
      { author: "kit", repo: "acme/widgets", sinceDays: 7, state: "open" },
      NOW
    );
    expect(query).toBe(
      "is:pr repo:acme/widgets is:open author:kit created:>=2026-01-24"
    );
  });

  it("prefers repo over org when both are present", () => {
    const query = buildSearchQuery(
      { org: "acme", repo: "acme/widgets", sinceDays: 30 },
      NOW
    );
    expect(query).toContain("repo:acme/widgets");
    expect(query).not.toContain("org:acme");
  });

  it("includes org, reviewer, and involves qualifiers", () => {
    const query = buildSearchQuery(
      { involves: "ada", org: "acme", reviewer: "kit", sinceDays: 30 },
      NOW
    );
    expect(query).toContain("org:acme");
    expect(query).toContain("reviewed-by:kit");
    expect(query).toContain("involves:ada");
  });
});
