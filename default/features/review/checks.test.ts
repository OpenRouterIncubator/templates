import { expect, test } from "bun:test";

import { formatFindings, reviewText } from "./checks.ts";

test("flags leftover markers, console.log, and trailing whitespace", () => {
  const text = [
    "const x = 1; // TODO: tidy",
    "console.log(x);",
    "const y = 2;  ",
  ].join("\n");
  const findings = reviewText(text);

  expect(findings).toEqual([
    { line: 1, message: "leftover TODO marker", rule: "no-leftover-markers" },
    { line: 2, message: "stray console.log", rule: "no-console-log" },
    { line: 3, message: "trailing whitespace", rule: "no-trailing-whitespace" },
  ]);
});

test("flags lines over the length limit", () => {
  const longLine = `const value = "${"a".repeat(130)}";`;
  const findings = reviewText(longLine);

  expect(findings).toHaveLength(1);
  expect(findings[0]?.rule).toBe("max-line-length");
});

test("returns no findings for clean text", () => {
  expect(reviewText("const x = 1;\nconst y = 2;\n")).toEqual([]);
});

test("formats findings one per line", () => {
  const formatted = formatFindings([
    { line: 2, message: "stray console.log", rule: "no-console-log" },
  ]);
  expect(formatted).toBe("2:no-console-log stray console.log");
});
