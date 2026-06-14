// Request a structured content brief from a model via OpenRouter.
import { type BriefData, parseBriefData } from "./brief.ts";

const COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM_PROMPT = [
  "You are a content strategist producing a brief for a writer.",
  "Be specific: a sharp angle and a falsifiable thesis, not platitudes.",
  "Respond as JSON:",
  '{"topic","audience","intent":"informational|comparison|transactional",',
  '"angle","thesis","outline":["H2", ...],"keywords":[],"questions":[],"cta"}.',
].join(" ");

interface CompletionResponse {
  readonly choices?: readonly {
    readonly message?: { readonly content?: string };
  }[];
}

export interface BriefRequest {
  readonly apiKey: string;
  readonly model: string;
  readonly topic: string;
}

export async function requestBrief(request: BriefRequest): Promise<BriefData> {
  const response = await fetch(COMPLETIONS_URL, {
    body: JSON.stringify({
      messages: [
        { content: SYSTEM_PROMPT, role: "system" },
        { content: `Topic: ${request.topic}`, role: "user" },
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
  return parseBriefData(data.choices?.[0]?.message?.content ?? "");
}
