// Request a structured contract analysis from a model via OpenRouter.
import { type Analysis, parseAnalysis } from "./contract.ts";

const COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM_PROMPT = [
  "You are a meticulous legal analyst reviewing a contract.",
  "Ground every observation in the text; quote the clause. Do not invent terms.",
  "Respond as JSON:",
  '{"documentType","parties":[],"summary","keyTerms":[],"obligations":[],',
  '"risks":[{"clause","severity":"critical|high|medium|low","issue","recommendation"}]}.',
  "This is review assistance, not legal advice.",
].join(" ");

interface CompletionResponse {
  readonly choices?: readonly {
    readonly message?: { readonly content?: string };
  }[];
}

export interface AnalysisRequest {
  readonly apiKey: string;
  readonly model: string;
  readonly prompt: string;
}

export async function requestAnalysis(
  request: AnalysisRequest
): Promise<Analysis> {
  const response = await fetch(COMPLETIONS_URL, {
    body: JSON.stringify({
      messages: [
        { content: SYSTEM_PROMPT, role: "system" },
        { content: request.prompt, role: "user" },
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
  return parseAnalysis(data.choices?.[0]?.message?.content ?? "");
}
