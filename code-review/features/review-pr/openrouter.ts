// Request structured review findings from a model via the OpenRouter API.
import { type Finding, parseFindings } from "./review.ts";

const COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM_PROMPT = [
  "You are a rigorous code reviewer.",
  "Review the diff and report only substantiated, high-signal findings.",
  'Respond as JSON: {"findings":[{"path","line","severity","body"}]}.',
  'severity is "must-fix" or "suggestion". line is the new-file line number.',
  "If there is nothing worth flagging, return an empty findings array.",
].join(" ");

interface CompletionResponse {
  readonly choices?: readonly {
    readonly message?: { readonly content?: string };
  }[];
}

export interface FindingsRequest {
  readonly apiKey: string;
  readonly model: string;
  readonly prompt: string;
}

export async function requestFindings(
  request: FindingsRequest
): Promise<readonly Finding[]> {
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
  const content = data.choices?.[0]?.message?.content ?? "";
  return parseFindings(content);
}
