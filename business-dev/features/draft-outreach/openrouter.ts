// Request a personalized cold-outreach draft from a model via OpenRouter.
import { type Draft, parseDraftData } from "./outreach.ts";

const COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM_PROMPT = [
  "You write short, personalized cold outreach for a human to review and send.",
  "Reference something specific and true about the prospect from the research.",
  "Under 150 words. No clichés (no 'hope this finds you well', 'circle back',",
  "'quick question', 'synergy'). One clear, low-friction call to action.",
  "Never claim the prospect uses a product, or invent facts.",
  'Respond as JSON: {"subject","body"}.',
].join(" ");

interface CompletionResponse {
  readonly choices?: readonly {
    readonly message?: { readonly content?: string };
  }[];
}

export interface DraftRequest {
  readonly apiKey: string;
  readonly model: string;
  readonly research: string;
}

export async function requestDraft(request: DraftRequest): Promise<Draft> {
  const response = await fetch(COMPLETIONS_URL, {
    body: JSON.stringify({
      messages: [
        { content: SYSTEM_PROMPT, role: "system" },
        {
          content: `Research card:\n\n${request.research}`,
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
  return parseDraftData(data.choices?.[0]?.message?.content ?? "");
}
