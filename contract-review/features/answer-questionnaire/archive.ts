// Load a local archive of past questionnaire Q&A pairs. Uses node:fs;
// isolated from the pure questionnaire logic.
import { readdir, readFile } from "node:fs/promises";
import { parseQaPairs, type QaPair } from "./questionnaire.ts";

export async function loadArchive(dir: string): Promise<readonly QaPair[]> {
  // A missing archive directory just means no grounding material.
  const entries = await readdir(dir, { recursive: true }).catch(
    () => [] as string[]
  );
  const pairs: QaPair[] = [];
  for (const rel of entries) {
    if (!rel.endsWith(".md")) {
      continue;
    }
    // The file came from readdir, so a read failure here is a real problem
    // (e.g. permissions) — surface it rather than silently dropping pairs.
    const text = await readFile(`${dir}/${rel}`, "utf8");
    pairs.push(...parseQaPairs(text));
  }
  return pairs;
}
