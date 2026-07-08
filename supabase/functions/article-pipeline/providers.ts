import type { AiProvider } from "./types.ts";

export type LlmResult = {
  text: string;
  tokens_in?: number;
  tokens_out?: number;
};

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  return trimmed;
}

function extractJson(text: string): string {
  const trimmed = stripCodeFences(text);
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  throw new Error("AI odpověď neobsahuje JSON.");
}

/** Opravy běžných chyb v LLM JSON (trailing commas, smart quotes, řídicí znaky). */
export function repairJson(text: string): string {
  let s = extractJson(text);
  s = s.replace(/^\uFEFF/, "");
  s = s.replace(/[\u201c\u201d\u201e\u201f]/g, '"');
  s = s.replace(/[\u2018\u2019]/g, "'");
  // Trailing commas před ] nebo }
  s = s.replace(/,\s*([}\]])/g, "$1");
  return s.trim();
}

/** Pokus o uzavření useknutého JSON (např. při dosažení max_tokens). */
export function salvageTruncatedJson(text: string): string | null {
  let s = repairJson(text);
  const stack: string[] = [];
  let inString = false;
  let escape = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{") stack.push("}");
    else if (c === "[") stack.push("]");
    else if ((c === "}" || c === "]") && stack.length && stack[stack.length - 1] === c) {
      stack.pop();
    }
  }

  if (!stack.length) return null;

  // Odstranit nedokončený prvek na konci pole/objektu
  s = s.replace(/,\s*"[^"\\]*(?:\\.[^"\\]*)*"\s*:\s*"[^"\\]*(?:\\.[^"\\]*)*$/s, "");
  s = s.replace(/,\s*"[^"\\]*(?:\\.[^"\\]*)*"\s*:\s*[^,}\]]*$/s, "");
  s = s.replace(/,\s*"[^"\\]*(?:\\.[^"\\]*)*"?\s*$/s, "");
  s = s.replace(/,\s*\{[^}]*$/s, "");
  s = s.replace(/,\s*\[[^\]]*$/s, "");
  s = s.replace(/,\s*$/s, "");

  while (stack.length) s += stack.pop();
  return s;
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

function assertJsonObject(parsed: unknown): Record<string, unknown> {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JSON musí být objekt.");
  }
  return parsed as Record<string, unknown>;
}

export function parseJsonOutput(text: string): Record<string, unknown> {
  const attempts = [
    () => JSON.parse(extractJson(text)),
    () => JSON.parse(repairJson(text)),
    () => {
      const salvaged = salvageTruncatedJson(text);
      if (!salvaged) throw new Error("Nelze opravit useknutý JSON.");
      return JSON.parse(salvaged);
    },
  ];

  let lastErr: Error | null = null;
  for (const attempt of attempts) {
    try {
      return assertJsonObject(attempt());
    } catch (err) {
      lastErr = err as Error;
    }
  }

  throw new Error(`Neplatný JSON z AI: ${lastErr?.message || "parse error"}`);
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
