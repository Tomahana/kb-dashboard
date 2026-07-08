import type { AiRole, AiProvider, AIRoleConfig } from "./types.ts";

const ETHICS_SYSTEM = `You assist with scholarly manuscript preparation in KB Dashboard Article Factory.
NEVER invent literature, DOI, citations, empirical data, results, or journal metadata.
If information is not in verified sources provided, mark it verification_status: "unverified" and label "nutno ověřit".
Distinguish: verified_fact, interpretation, hypothesis, proposal, unverified.
Output is NEVER a final submission-ready article — it requires human revision.
Respond ONLY with valid JSON matching the requested schema.
Manuscript section text: English. Comments to the author: Czech.`;

export const ROLE_CONFIGS: Record<AiRole, AIRoleConfig> = {
  research_strategist: {
    role: "research_strategist",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    temperature: 0.2,
    max_tokens: 4096,
    enabled: true,
    system_prompt: ETHICS_SYSTEM,
    role_prompt: "You are Research Strategist. Refine research question, hypothesis, contribution. Check overlap with author's prior publications. Do not cite new sources.",
    output_schema: {
      research_question: { text: "", verification_status: "proposal" },
      hypothesis: { text: "", verification_status: "hypothesis" },
      expected_contribution: { text: "", verification_status: "interpretation" },
      overlap_risks: [],
      factual_basis: { verified_facts: [], hypotheses: [], unverified: [] },
      human_work_needed: [],
    },
  },
  literature_scout: {
    role: "literature_scout",
    provider: "openai",
    model: "gpt-4o-mini",
    temperature: 0.15,
    max_tokens: 4096,
    enabled: true,
    system_prompt: ETHICS_SYSTEM,
    role_prompt: "You are Literature Scout. Propose search queries and gaps ONLY. Do NOT output fake citations or DOIs. Use source_placeholders with verification_status unverified.",
    output_schema: {
      literature_gaps: [],
      suggested_search_queries: [],
      source_placeholders: [],
      section_outline: "",
      human_work_needed: [],
    },
  },
  methodology_designer: {
    role: "methodology_designer",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    temperature: 0.2,
    max_tokens: 4096,
    enabled: true,
    system_prompt: ETHICS_SYSTEM,
    role_prompt: "You are Methodology Designer. Draft methodology without claiming collected data or results. Flag empirical claims without data.",
    output_schema: {
      methodology_section_draft: "",
      design_decisions: [],
      limitations: "",
      ethical_considerations: [],
      contains_empirical_claims_without_data: false,
      factual_basis: { proposals: [], unverified: [] },
      human_work_needed: [],
    },
  },
  manuscript_writer: {
    role: "manuscript_writer",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    temperature: 0.25,
    max_tokens: 8192,
    enabled: true,
    system_prompt: ETHICS_SYSTEM,
    role_prompt: "You are Manuscript Writer. Draft sections in English from approved brief. Mark expected results clearly. Include factual_basis and human_work_needed.",
    output_schema: {
      title: "",
      abstract: "",
      keywords: "",
      introduction: "",
      literature_review: "",
      methodology: "",
      results_or_expected_results: "",
      discussion: "",
      conclusion: "",
      limitations: "",
      references: [],
      factual_basis: {},
      human_work_needed: [],
      reviewer_notes: [],
    },
  },
  critical_reviewer: {
    role: "critical_reviewer",
    provider: "xai",
    model: "grok-3",
    temperature: 0.2,
    max_tokens: 4096,
    enabled: true,
    system_prompt: ETHICS_SYSTEM,
    role_prompt: "You are Critical Reviewer. Identify weaknesses. Do not rewrite the manuscript.",
    output_schema: {
      strengths: "",
      weaknesses: "",
      factual_risks: "",
      methodological_risks: "",
      recommendations: [],
    },
  },
  journal_fit_reviewer: {
    role: "journal_fit_reviewer",
    provider: "openai",
    model: "gpt-4o-mini",
    temperature: 0.15,
    max_tokens: 3072,
    enabled: true,
    system_prompt: ETHICS_SYSTEM,
    role_prompt: "You are Journal Fit Reviewer. Assess fit to target journal scope only from provided journal data.",
    output_schema: {
      journal_fit_assessment: "",
      mismatch_risks: [],
      formatting_notes: [],
    },
  },
  integrity_reviewer: {
    role: "integrity_reviewer",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    temperature: 0.15,
    max_tokens: 4096,
    enabled: true,
    system_prompt: ETHICS_SYSTEM,
    role_prompt: "You are Integrity and Originality Reviewer. Check self-plagiarism risks, AI transparency, ethics.",
    output_schema: {
      originality_assessment: "",
      self_plagiarism_risks: [],
      ai_usage_disclosure_draft: "",
      ethics_flags: [],
      blocking_issues: [],
    },
  },
  final_revision_assistant: {
    role: "final_revision_assistant",
    provider: "openai",
    model: "gpt-4o-mini",
    temperature: 0.1,
    max_tokens: 3072,
    enabled: true,
    system_prompt: ETHICS_SYSTEM,
    role_prompt: "You are Final Human-Revision Assistant. Produce prioritized checklist. export_readiness must be false.",
    output_schema: {
      revision_checklist: [],
      priority_order: [],
      estimated_human_hours: 0,
      export_readiness: false,
      human_work_needed: [],
    },
  },
};

/** Article Factory — vlastní Anthropic klíč (odděleně od kb-agent). Fallback na sdílený ANTHROPIC_API_KEY. */
export function getAnthropicApiKey(): string | null {
  return Deno.env.get("ANTHROPIC_API_KEY_article") || Deno.env.get("ANTHROPIC_API_KEY") || null;
}

export function getProviderApiKey(provider: AiProvider): string | null {
  if (provider === "anthropic") return getAnthropicApiKey();
  const map: Record<string, string> = {
    openai: "OPENAI_API_KEY",
    xai: "XAI_API_KEY",
    google: "GOOGLE_API_KEY",
  };
  const envKey = map[provider];
  if (!envKey) return null;
  return Deno.env.get(envKey) || null;
}

export function aiKeysStatus(): Record<string, boolean> {
  return {
    openai: !!Deno.env.get("OPENAI_API_KEY"),
    anthropic: !!getAnthropicApiKey(),
    anthropic_article: !!Deno.env.get("ANTHROPIC_API_KEY_article"),
    anthropic_shared: !!Deno.env.get("ANTHROPIC_API_KEY"),
    xai: !!Deno.env.get("XAI_API_KEY"),
    google: !!Deno.env.get("GOOGLE_API_KEY"),
  };
}

export function getRoleConfig(role: AiRole): AIRoleConfig {
  return ROLE_CONFIGS[role];
}
