// Request structured findings from one model via the OpenRouter API. Unlike the
// review-pr client this takes a per-dimension system prompt so each fan-out pass
// stays on its concern, and an AbortSignal so a stalled turn can be interrupted.
import { type Finding, parseFindings } from "./findings.ts";

const COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";

interface CompletionResponse {
  readonly choices?: readonly {
    readonly message?: { readonly content?: string };
  }[];
}

export interface FindingsRequest {
  readonly apiKey: string;
  readonly model: string;
  readonly prompt: string;
  readonly signal?: AbortSignal;
  readonly system: string;
}

export async function requestFindings(
  request: FindingsRequest
): Promise<readonly Finding[]> {
  const response = await fetch(COMPLETIONS_URL, {
    body: JSON.stringify({
      messages: [
        { content: request.system, role: "system" },
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
    signal: request.signal,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `OpenRouter request failed (HTTP ${response.status}): ${detail}`
    );
  }
  const data = (await response.json()) as CompletionResponse;
  return parseFindings(data.choices?.[0]?.message?.content ?? "");
}
