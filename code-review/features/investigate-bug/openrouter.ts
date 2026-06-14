// Request a structured root-cause analysis from a model via OpenRouter.
import { parseRca, type Rca } from "./rca.ts";

const COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM_PROMPT = [
  "You are a debugging expert doing static root-cause analysis.",
  "Use only the provided code; trace the data, don't guess.",
  "Respond as JSON:",
  '{"summary","rootCause","fix","confidence":"high|medium|low",',
  '"needsRuntime":boolean,"citations":[{"path","line","note"}]}.',
  "Set needsRuntime true when static analysis cannot settle the cause.",
].join(" ");

interface CompletionResponse {
  readonly choices?: readonly {
    readonly message?: { readonly content?: string };
  }[];
}

export interface RcaRequest {
  readonly apiKey: string;
  readonly model: string;
  readonly prompt: string;
}

export async function requestRca(request: RcaRequest): Promise<Rca> {
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
  return parseRca(data.choices?.[0]?.message?.content ?? "");
}
