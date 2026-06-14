// Request a structured lead research card from a model via OpenRouter.
import { parseCardData, type ResearchCard } from "./research.ts";

const COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM_PROMPT = [
  "You are a BD research analyst preparing a one-page card on a prospect.",
  "Strictly separate verified facts from inferences; never state a guess as fact.",
  "If you don't know something, put it under unknowns rather than inventing it.",
  "Respond as JSON:",
  '{"name","company","role","companyFacts":[],"signals":[],',
  '"talkingPoints":[],"inferences":[],"unknowns":[]}.',
].join(" ");

interface CompletionResponse {
  readonly choices?: readonly {
    readonly message?: { readonly content?: string };
  }[];
}

export interface ResearchRequest {
  readonly apiKey: string;
  readonly company: string;
  readonly model: string;
  readonly name: string;
}

export async function requestResearch(
  request: ResearchRequest
): Promise<ResearchCard> {
  const response = await fetch(COMPLETIONS_URL, {
    body: JSON.stringify({
      messages: [
        { content: SYSTEM_PROMPT, role: "system" },
        {
          content: `Prospect: ${request.name} at ${request.company}`,
          role: "user",
        },
      ],
      model: request.model,
      response_format: { type: "json_object" },
    }),
    headers: {
      Authorization: `Bearer ${request.apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `OpenRouter request failed (HTTP ${response.status}): ${detail}`
    );
  }
  const data = (await response.json()) as CompletionResponse;
  return parseCardData(data.choices?.[0]?.message?.content ?? "");
}
