// Request proposed contract edits from a model via OpenRouter.
import { wrapDocument } from "../review-contract/contract.ts";
import { type Edit, parseEdits } from "./redline.ts";

const COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM_PROMPT = [
  "You redline contracts: propose specific text edits in favor of the party",
  "you represent, limited to clauses that genuinely need changing.",
  "For each edit, 'original' must be copied VERBATIM from the document (a",
  "contiguous span, ideally under 300 characters) so it can be anchored",
  "exactly; 'proposed' is the replacement text, or an empty string to delete.",
  "Give a short rationale and a severity for each. Do not rewrite style,",
  "fix typos, or edit clauses that are already acceptable.",
  "Respond as JSON:",
  '{"edits":[{"original","proposed","rationale","severity":"critical|high|medium|low"}]}.',
].join(" ");

interface CompletionResponse {
  readonly choices?: readonly {
    readonly message?: { readonly content?: string };
  }[];
}

export interface RedlineRequest {
  readonly apiKey: string;
  readonly filename: string;
  readonly model: string;
  readonly party: string;
  readonly text: string;
}

export async function requestEdits(
  request: RedlineRequest
): Promise<readonly Edit[]> {
  const response = await fetch(COMPLETIONS_URL, {
    body: JSON.stringify({
      messages: [
        { content: SYSTEM_PROMPT, role: "system" },
        {
          content: [
            `Redline this contract on behalf of: ${request.party}`,
            "",
            wrapDocument(request.filename, request.text),
          ].join("\n"),
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
  return parseEdits(data.choices?.[0]?.message?.content ?? "");
}
