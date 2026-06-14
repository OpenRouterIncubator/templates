// Request a full content draft from a model via OpenRouter.
const COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM_PROMPT =
  "You are a skilled writer. Produce the piece exactly as briefed, in plain markdown, with a concrete human voice.";

interface CompletionResponse {
  readonly choices?: readonly {
    readonly message?: { readonly content?: string };
  }[];
}

export interface DraftRequest {
  readonly apiKey: string;
  readonly model: string;
  readonly prompt: string;
}

export async function requestDraft(request: DraftRequest): Promise<string> {
  const response = await fetch(COMPLETIONS_URL, {
    body: JSON.stringify({
      messages: [
        { content: SYSTEM_PROMPT, role: "system" },
        { content: request.prompt, role: "user" },
      ],
      model: request.model,
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
  return data.choices?.[0]?.message?.content ?? "";
}
