import type { AiProvider } from "./types.ts";

export type LlmResult = {
  text: string;
  tokens_in?: number;
  tokens_out?: number;
};

function extractJson(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  throw new Error("AI odpověď neobsahuje JSON.");
}

export async function callLlm(
  provider: AiProvider,
  apiKey: string,
  model: string,
  system: string,
  user: string,
  temperature: number,
  maxTokens: number,
): Promise<LlmResult> {
  if (provider === "openai" || provider === "other") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 400)}`);
    const data = await res.json();
    return {
      text: data.choices?.[0]?.message?.content || "",
      tokens_in: data.usage?.prompt_tokens,
      tokens_out: data.usage?.completion_tokens,
    };
  }

  if (provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 400)}`);
    const data = await res.json();
    const text = (data.content || []).map((c: { text?: string }) => c.text || "").join("");
    return {
      text,
      tokens_in: data.usage?.input_tokens,
      tokens_out: data.usage?.output_tokens,
    };
  }

  if (provider === "xai") {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`xAI ${res.status}: ${(await res.text()).slice(0, 400)}`);
    const data = await res.json();
    return {
      text: data.choices?.[0]?.message?.content || "",
      tokens_in: data.usage?.prompt_tokens,
      tokens_out: data.usage?.completion_tokens,
    };
  }

  if (provider === "google") {
    throw new Error("Google provider není v MVP implementován — nastavte jiný provider nebo přidejte GOOGLE_API_KEY později.");
  }

  throw new Error(`Nepodporovaný provider: ${provider}`);
}

export function parseJsonOutput(text: string): Record<string, unknown> {
  const raw = extractJson(text);
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JSON musí být objekt.");
  }
  return parsed as Record<string, unknown>;
}

export function buildMarkdownFromSections(sections: Record<string, string>, title: string): string {
  const order = [
    ["Abstract", sections.abstract],
    ["Keywords", sections.keywords],
    ["Introduction", sections.introduction],
    ["Literature Review", sections.literature_review],
    ["Methodology", sections.methodology],
    ["Results (or Expected Results)", sections.results_or_expected_results],
    ["Discussion", sections.discussion],
    ["Conclusion", sections.conclusion],
    ["Limitations", sections.limitations],
  ];
  const lines = [`# ${title}`, "", "> **DRAFT** — Requires human revision. Not submission-ready.", ""];
  for (const [heading, body] of order) {
    if (!body) continue;
    lines.push(`## ${heading}`, "", body, "");
  }
  return lines.join("\n");
}
