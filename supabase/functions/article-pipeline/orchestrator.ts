import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  AI_ROLES,
  type AiRole,
  type AIRoleOutput,
  type PipelineLogEntry,
  DEFAULT_REVISION_CHECKLIST,
  EMPTY_FACTUAL_BASIS,
} from "./types.ts";
import { getRoleConfig, getProviderApiKey } from "./config.ts";
import { callLlm, parseJsonOutput, buildMarkdownFromSections } from "./providers.ts";

type ProjectContext = {
  project: Record<string, unknown>;
  topic: Record<string, unknown> | null;
  journal: Record<string, unknown> | null;
  publications: Record<string, unknown>[];
  literature: Record<string, unknown>[];
  priorReviews: Record<string, unknown>[];
  currentVersion: Record<string, unknown> | null;
};

const ROLE_APPROVAL_GATE: Record<AiRole, string> = {
  research_strategist: "topic_selection",
  literature_scout: "research_design",
  methodology_designer: "research_design",
  manuscript_writer: "evidence_plan",
  critical_reviewer: "evidence_plan",
  journal_fit_reviewer: "evidence_plan",
  integrity_reviewer: "evidence_plan",
  final_revision_assistant: "evidence_plan",
};

async function assertRoleApproved(
  supabase: SupabaseClient,
  projectId: string,
  role: AiRole,
) {
  const checkpoint = ROLE_APPROVAL_GATE[role];
  const { data, error } = await supabase
    .from("kb_article_approvals")
    .select("decision, created_at")
    .eq("article_project_id", projectId)
    .eq("checkpoint", checkpoint)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Nelze ověřit lidské schválení: ${error.message}`);
  if (!data || data.decision !== "approved") {
    throw new Error(`Krok ${role} je uzamčen. Chybí lidské schválení kontrolního bodu ${checkpoint}.`);
  }
}

async function loadContext(
  supabase: SupabaseClient,
  projectId: string,
): Promise<ProjectContext> {
  const { data: project, error: pErr } = await supabase
    .from("kb_article_projects")
    .select("*")
    .eq("id", projectId)
    .single();
  if (pErr || !project) throw new Error("Projekt nenalezen.");

  let topic = null;
  if (project.topic_id) {
    const { data } = await supabase.from("kb_article_topics").select("*").eq("id", project.topic_id).maybeSingle();
    topic = data;
  }

  let journal = null;
  if (project.target_journal_id) {
    const { data } = await supabase.from("kb_article_target_journals").select("*").eq("id", project.target_journal_id).maybeSingle();
    journal = data;
  }

  const { data: publications } = await supabase.from("kb_article_publications").select("id,title,authors,year,journal_or_publisher,doi,abstract,methodology,main_findings").limit(80);
  const { data: literature } = await supabase.from("kb_article_literature_sources").select("*").eq("article_project_id", projectId);
  const { data: priorReviews } = await supabase.from("kb_article_ai_role_reviews").select("*").eq("article_project_id", projectId).order("created_at", { ascending: true });

  let currentVersion = null;
  if (project.current_version_id) {
    const { data } = await supabase.from("kb_article_versions").select("*").eq("id", project.current_version_id).maybeSingle();
    currentVersion = data;
  }

  return {
    project,
    topic,
    journal,
    publications: publications || [],
    literature: literature || [],
    priorReviews: priorReviews || [],
    currentVersion,
  };
}

function publicationsForRole(role: AiRole, ctx: ProjectContext): Record<string, unknown>[] {
  const all = ctx.publications || [];
  if (role !== "research_strategist" && role !== "integrity_reviewer") {
    return all.slice(0, 40);
  }
  const relatedIds = new Set(
    ((ctx.topic?.related_publication_ids as string[]) || []).filter(Boolean),
  );
  const related = relatedIds.size
    ? all.filter((p) => relatedIds.has(String(p.id)))
    : all.slice(0, 12);
  return related.map((p) => ({
    id: p.id,
    title: p.title,
    year: p.year,
    journal_or_publisher: p.journal_or_publisher,
    doi: p.doi,
    main_findings: typeof p.main_findings === "string" ? String(p.main_findings).slice(0, 400) : p.main_findings,
    methodology: typeof p.methodology === "string" ? String(p.methodology).slice(0, 300) : p.methodology,
  }));
}

function buildUserPrompt(role: AiRole, ctx: ProjectContext, priorOutputs: Record<string, unknown>): string {
  const payload = {
    role,
    project: ctx.project,
    topic: ctx.topic,
    target_journal: ctx.journal,
    author_publications: publicationsForRole(role, ctx),
    verified_literature: (ctx.literature || []).filter((l) => l.verified),
    unverified_literature: (ctx.literature || []).filter((l) => !l.verified),
    prior_ai_outputs: priorOutputs,
    current_manuscript: ctx.currentVersion,
    rules: [
      "Do not invent DOI, citations, data, or results.",
      "Mark unverified as verification_status: unverified / nutno ověřit.",
      "Manuscript sections in English; comments in Czech.",
    ],
  };
  const cfg = getRoleConfig(role);
  return `${cfg.role_prompt}\n\nReturn JSON matching this schema shape:\n${JSON.stringify(cfg.output_schema, null, 2)}\n\nContext:\n${JSON.stringify(payload, null, 2)}`;
}

async function appendLog(
  supabase: SupabaseClient,
  runId: string,
  log: PipelineLogEntry[],
  entry: PipelineLogEntry,
) {
  log.push(entry);
  await supabase.from("kb_article_pipeline_runs").update({
    run_log: log,
    current_step: entry.step === "system" ? undefined : entry.step,
  }).eq("id", runId);
}

async function saveReview(
  supabase: SupabaseClient,
  projectId: string,
  versionId: string | null,
  role: AiRole,
  model: string,
  parsed: Record<string, unknown>,
) {
  const row = {
    article_project_id: projectId,
    article_version_id: versionId,
    ai_role: role,
    model_used: model,
    review_type: role,
    strengths: String(parsed.strengths || parsed.originality_assessment || ""),
    weaknesses: String(parsed.weaknesses || ""),
    factual_risks: String(parsed.factual_risks || ""),
    methodological_risks: String(parsed.methodological_risks || ""),
    literature_gaps: JSON.stringify(parsed.literature_gaps || parsed.suggested_search_queries || []),
    journal_fit_assessment: String(parsed.journal_fit_assessment || ""),
    recommendations: parsed.recommendations || parsed.revision_checklist || parsed.blocking_issues || [],
    raw_output: parsed,
  };
  await supabase.from("kb_article_ai_role_reviews").insert(row);
}

async function applyRoleResult(
  supabase: SupabaseClient,
  role: AiRole,
  ctx: ProjectContext,
  parsed: Record<string, unknown>,
  model: string,
): Promise<string | null> {
  const projectId = String(ctx.project.id);

  if (role === "research_strategist") {
    const rq = parsed.research_question as { text?: string } | undefined;
    const hyp = parsed.hypothesis as { text?: string } | undefined;
    const contrib = parsed.expected_contribution as { text?: string } | undefined;
    await supabase.from("kb_article_projects").update({
      research_question: rq?.text || ctx.project.research_question,
      hypothesis_or_objective: hyp?.text || ctx.project.hypothesis_or_objective,
      expected_contribution: contrib?.text || ctx.project.expected_contribution,
      status: "literature",
    }).eq("id", projectId);
    await saveReview(supabase, projectId, null, role, model, parsed);
    return null;
  }

  if (role === "literature_scout") {
    const placeholders = (parsed.source_placeholders as Array<Record<string, unknown>>) || [];
    for (const ph of placeholders.slice(0, 20)) {
      await supabase.from("kb_article_literature_sources").insert({
        article_project_id: projectId,
        citation: String(ph.description || ph.topic || "Navržený zdroj — nutno ověřit"),
        source_type: "ai_suggested_unverified",
        verified: false,
        relevance_note: String(ph.relevance || ph.search_query || ""),
      });
    }
    await saveReview(supabase, projectId, null, role, model, parsed);
    return null;
  }

  if (role === "methodology_designer") {
    await supabase.from("kb_article_projects").update({
      methodology: String(parsed.methodology_section_draft || ctx.project.methodology || ""),
      status: "drafting",
    }).eq("id", projectId);
    await saveReview(supabase, projectId, null, role, model, parsed);
    return null;
  }

  if (role === "manuscript_writer") {
    const { data: versions } = await supabase.from("kb_article_versions").select("version_number").eq("article_project_id", projectId).order("version_number", { ascending: false }).limit(1);
    const nextVer = ((versions?.[0]?.version_number as number) || 0) + 1;
    const title = String(parsed.title || ctx.project.working_title || "Working title");
    const sections = {
      abstract: String(parsed.abstract || ""),
      keywords: String(parsed.keywords || ""),
      introduction: String(parsed.introduction || ""),
      literature_review: String(parsed.literature_review || ""),
      methodology: String(parsed.methodology || ""),
      results_or_expected_results: String(parsed.results_or_expected_results || ""),
      discussion: String(parsed.discussion || ""),
      conclusion: String(parsed.conclusion || ""),
      limitations: String(parsed.limitations || ""),
    };
    const md = buildMarkdownFromSections(sections, title);
    const { data: version, error } = await supabase.from("kb_article_versions").insert({
      article_project_id: projectId,
      version_number: nextVer,
      title,
      ...sections,
      references: parsed.references || [],
      full_text_markdown: md,
      factual_basis: parsed.factual_basis || EMPTY_FACTUAL_BASIS,
      human_work_needed: parsed.human_work_needed || [],
      reviewer_notes: parsed.reviewer_notes || [],
      created_by_role: role,
      model_used: model,
      is_draft: true,
    }).select("id").single();
    if (error) throw error;
    await supabase.from("kb_article_projects").update({
      current_version_id: version.id,
      working_title: title,
      status: "reviewing",
    }).eq("id", projectId);
    await saveReview(supabase, projectId, version.id, role, model, parsed);
    return version.id as string;
  }

  const versionId = ctx.currentVersion?.id ? String(ctx.currentVersion.id) : null;
  await saveReview(supabase, projectId, versionId, role, model, parsed);

  if (role === "final_revision_assistant") {
    const checklist = (parsed.revision_checklist as unknown[])?.length
      ? parsed.revision_checklist
      : DEFAULT_REVISION_CHECKLIST;
    const humanWork = parsed.human_work_needed || [];
    if (versionId) {
      await supabase.from("kb_article_versions").update({
        human_work_needed: humanWork,
      }).eq("id", versionId);
    }
    await supabase.from("kb_article_projects").update({
      revision_checklist: checklist,
      status: "human_revision",
    }).eq("id", projectId);
  }

  return versionId;
}

export async function runSingleStep(
  supabase: SupabaseClient,
  projectId: string,
  role: AiRole,
  priorOutputs: Record<string, unknown>,
  runId?: string,
  log?: PipelineLogEntry[],
): Promise<AIRoleOutput> {
  await assertRoleApproved(supabase, projectId, role);
  const cfg = getRoleConfig(role);
  if (!cfg.enabled) {
    return { role, provider: cfg.provider, model: cfg.model, ok: false, skipped: true, error: "Role disabled" };
  }

  const apiKey = getProviderApiKey(cfg.provider);
  if (!apiKey) {
    const msg = `Chybí API klíč pro ${cfg.provider} — krok přeskočen.`;
    if (runId && log) {
      await appendLog(supabase, runId, log, { at: new Date().toISOString(), step: role, level: "warn", message: msg });
    }
    return { role, provider: cfg.provider, model: cfg.model, ok: false, skipped: true, error: msg };
  }

  const ctx = await loadContext(supabase, projectId);
  const userPrompt = buildUserPrompt(role, ctx, priorOutputs);

  try {
    const llm = await callLlm(cfg.provider, apiKey, cfg.model, cfg.system_prompt, userPrompt, cfg.temperature, cfg.max_tokens);
    let parsed: Record<string, unknown>;
    try {
      parsed = parseJsonOutput(llm.text);
    } catch (parseErr) {
      const repairPrompt = `${userPrompt}\n\nPŘEDCHOZÍ ODPOVĚĎ NEBYLA VALIDNÍ JSON (${(parseErr as Error).message}). Vrať POUZE opravený kompaktní JSON objekt podle schématu — bez markdown, bez trailing čárek.`;
      const retry = await callLlm(cfg.provider, apiKey, cfg.model, cfg.system_prompt, repairPrompt, 0, cfg.max_tokens);
      parsed = parseJsonOutput(retry.text || llm.text);
    }
    await applyRoleResult(supabase, role, ctx, parsed, cfg.model);
    if (runId && log) {
      await appendLog(supabase, runId, log, {
        at: new Date().toISOString(),
        step: role,
        level: "info",
        message: `Krok ${role} dokončen.`,
        detail: { tokens_in: llm.tokens_in, tokens_out: llm.tokens_out },
      });
    }
    return {
      role,
      provider: cfg.provider,
      model: cfg.model,
      ok: true,
      raw_text: llm.text,
      parsed,
      tokens_in: llm.tokens_in,
      tokens_out: llm.tokens_out,
    };
  } catch (err) {
    const msg = (err as Error).message || String(err);
    if (runId && log) {
      await appendLog(supabase, runId, log, { at: new Date().toISOString(), step: role, level: "error", message: msg });
    }
    return { role, provider: cfg.provider, model: cfg.model, ok: false, error: msg };
  }
}

export async function runFullPipeline(
  supabase: SupabaseClient,
  projectId: string,
): Promise<{ run_id: string; results: AIRoleOutput[]; log: PipelineLogEntry[] }> {
  const month = new Date();
  const monthStr = `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}-01`;

  const { data: project } = await supabase.from("kb_article_projects").select("topic_id").eq("id", projectId).single();
  const log: PipelineLogEntry[] = [];

  const { data: run, error: runErr } = await supabase.from("kb_article_pipeline_runs").insert({
    month: monthStr,
    article_project_id: projectId,
    selected_topic_id: project?.topic_id || null,
    status: "running",
    current_step: AI_ROLES[0],
    run_log: [],
    summary: "Pipeline spuštěna",
  }).select("id").single();
  if (runErr || !run) throw new Error(runErr?.message || "Nelze vytvořit pipeline run.");

  const runId = run.id as string;
  await appendLog(supabase, runId, log, { at: new Date().toISOString(), step: "system", level: "info", message: "Pipeline start" });

  const priorOutputs: Record<string, unknown> = {};
  const results: AIRoleOutput[] = [];

  for (const role of AI_ROLES) {
    const result = await runSingleStep(supabase, projectId, role, priorOutputs, runId, log);
    results.push(result);
    if (result.parsed) priorOutputs[role] = result.parsed;
    if (!result.ok && !result.skipped) {
      await supabase.from("kb_article_pipeline_runs").update({
        status: "failed",
        summary: `Selhalo na kroku ${role}: ${result.error}`,
        completed_at: new Date().toISOString(),
        run_log: log,
      }).eq("id", runId);
      return { run_id: runId, results, log };
    }
  }

  await supabase.from("kb_article_pipeline_runs").update({
    status: "completed",
    summary: "Pipeline dokončena — vyžaduje lidskou revizi.",
    completed_at: new Date().toISOString(),
    run_log: log,
    current_step: null,
  }).eq("id", runId);

  return { run_id: runId, results, log };
}
