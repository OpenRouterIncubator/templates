// General chat path: when the prompt isn't a review request, stream a normal
// assistant reply from OpenRouter so the intern stays conversational (and honors
// its persona system prompt). The SSE line parser is pure and unit-tested; the
// streaming reader is the only I/O.
const COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";
const DATA_PREFIX = "data:";
const DONE_TOKEN = "[DONE]";

export interface ChatRequest {
  readonly apiKey: string;
  readonly model: string;
  readonly prompt: string;
  readonly system?: string;
  readonly temperature?: number;
}

interface StreamChunk {
  readonly choices?: readonly {
    readonly delta?: { readonly content?: string };
  }[];
}

export type SsePart =
  | { readonly kind: "delta"; readonly text: string }
  | { readonly kind: "done" }
  | { readonly kind: "skip" };

// Pure: interpret a single SSE line into a content delta, a done marker, or skip.
export function parseSseLine(line: string): SsePart {
  const trimmed = line.trim();
  if (!trimmed.startsWith(DATA_PREFIX)) {
    return { kind: "skip" };
  }
  const data = trimmed.slice(DATA_PREFIX.length).trim();
  if (data === DONE_TOKEN) {
    return { kind: "done" };
  }
  try {
    const chunk = JSON.parse(data) as StreamChunk;
    const delta = chunk.choices?.[0]?.delta?.content;
    return typeof delta === "string" && delta.length > 0
      ? { kind: "delta", text: delta }
      : { kind: "skip" };
  } catch {
    return { kind: "skip" };
  }
}

export async function* streamChat(
  request: ChatRequest
): AsyncGenerator<string> {
  const messages: { content: string; role: "system" | "user" }[] = [];
  if (request.system !== undefined && request.system.trim().length > 0) {
    messages.push({ content: request.system, role: "system" });
  }
  messages.push({ content: request.prompt, role: "user" });

  const response = await fetch(COMPLETIONS_URL, {
    body: JSON.stringify({
      messages,
      model: request.model,
      stream: true,
      ...(request.temperature === undefined
        ? {}
        : { temperature: request.temperature }),
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
      `OpenRouter chat failed (HTTP ${response.status}): ${detail}`
    );
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return;
  }
  const decoder = new TextDecoder();
  let buffer = "";
  let result = await reader.read();
  while (!result.done) {
    buffer += decoder.decode(result.value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const part = parseSseLine(line);
      if (part.kind === "done") {
        return;
      }
      if (part.kind === "delta") {
        yield part.text;
      }
    }
    result = await reader.read();
  }
}
