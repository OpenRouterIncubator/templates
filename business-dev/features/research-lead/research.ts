// Pure research-card logic: validate the model's structured output and render a
// markdown research card that separates verified facts from inferences. No I/O.

export interface ResearchCard {
  readonly company: string;
  readonly companyFacts: readonly string[];
  readonly inferences: readonly string[];
  readonly name: string;
  readonly role: string;
  readonly signals: readonly string[];
  readonly talkingPoints: readonly string[];
  readonly unknowns: readonly string[];
}

export function parseCardData(jsonText: string): ResearchCard {
  const parsed = safeParse(jsonText);
  const record = isRecord(parsed) ? parsed : {};
  return {
    company: asString(record.company),
    companyFacts: asStringList(record.companyFacts),
    inferences: asStringList(record.inferences),
    name: asString(record.name),
    role: asString(record.role),
    signals: asStringList(record.signals),
    talkingPoints: asStringList(record.talkingPoints),
    unknowns: asStringList(record.unknowns),
  };
}

export function renderCard(card: ResearchCard): string {
  const section = (title: string, items: readonly string[]): string[] =>
    items.length > 0 ? ["", `## ${title}`, ...items.map((i) => `- ${i}`)] : [];
  return [
    "---",
    `name: ${card.name}`,
    `company: ${card.company}`,
    `role: ${card.role}`,
    "---",
    "",
    `# Research: ${card.name} — ${card.company}`,
    ...section(
      "Company facts (model-stated — confirm before use)",
      card.companyFacts
    ),
    ...section("Signals", card.signals),
    ...section("Talking points", card.talkingPoints),
    ...section("Inferences (unverified)", card.inferences),
    ...section("Unknowns to confirm", card.unknowns),
    "",
  ].join("\n");
}

export function slug(name: string, company: string): string {
  return (
    `${name}-${company}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "lead"
  );
}

function asStringList(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
