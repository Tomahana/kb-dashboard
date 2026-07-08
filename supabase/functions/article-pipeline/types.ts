/** Article Factory — shared TypeScript types (Edge Function). */

export type AiProvider = "openai" | "anthropic" | "xai" | "google" | "other";

export type AiRole =
  | "research_strategist"
  | "literature_scout"
  | "methodology_designer"
  | "manuscript_writer"
  | "critical_reviewer"
  | "journal_fit_reviewer"
  | "integrity_reviewer"
  | "final_revision_assistant";

export const AI_ROLES: AiRole[] = [
  "research_strategist",
  "literature_scout",
  "methodology_designer",
  "manuscript_writer",
  "critical_reviewer",
  "journal_fit_reviewer",
  "integrity_reviewer",
  "final_revision_assistant",
];

export type VerificationStatus =
  | "verified_fact"
  | "interpretation"
  | "hypothesis"
  | "proposal"
  | "unverified";

export type ClaimItem = {
  claim: string;
  verification_status: VerificationStatus;
  source_ids?: string[];
  reason?: string;
  suggested_action?: string;
};

export type FactualBasis = {
  verified_facts: ClaimItem[];
  interpretations: ClaimItem[];
  hypotheses: ClaimItem[];
  proposals: ClaimItem[];
  unverified: ClaimItem[];
};

export type HumanWorkItem = {
  task: string;
  priority?: "high" | "medium" | "low";
  reason?: string;
  section?: string;
};

export type ManuscriptSection = {
  id: string;
  title: string;
  content: string;
};

export type HumanRevisionChecklistItem = {
  id: string;
  question: string;
  checked: boolean;
  notes?: string;
};

export type AIRoleConfig = {
  role: AiRole;
  provider: AiProvider;
  model: string;
  temperature: number;
  max_tokens: number;
  system_prompt: string;
  role_prompt: string;
  output_schema: Record<string, unknown>;
  enabled: boolean;
};

export type AIRoleOutput = {
  role: AiRole;
  provider: AiProvider;
  model: string;
  ok: boolean;
  skipped?: boolean;
  error?: string;
  raw_text?: string;
  parsed?: Record<string, unknown>;
  tokens_in?: number;
  tokens_out?: number;
};

export type Publication = {
  id: string;
  title: string;
  authors?: string;
  year?: number;
  journal_or_publisher?: string;
  doi?: string;
  abstract?: string;
  keywords?: string;
  methodology?: string;
  main_findings?: string;
};

export type PublicationTopic = {
  id: string;
  title: string;
  description?: string;
  research_area?: string;
  possible_methodology?: string;
  target_wos_category?: string;
  expected_contribution?: string;
  priority?: number;
  status?: string;
};

export type TargetJournal = {
  id: string;
  journal_title: string;
  wos_category?: string;
  quartile?: string;
  ais_rank_info?: string;
  scope?: string;
  submission_url?: string;
  author_guidelines_url?: string;
};

export type ArticleProject = {
  id: string;
  topic_id?: string;
  working_title?: string;
  target_journal_id?: string;
  research_question?: string;
  hypothesis_or_objective?: string;
  methodology?: string;
  expected_contribution?: string;
  status?: string;
  current_version_id?: string;
  revision_checklist?: HumanRevisionChecklistItem[];
};

export type ArticleVersion = {
  id: string;
  article_project_id: string;
  version_number: number;
  title?: string;
  abstract?: string;
  keywords?: string;
  introduction?: string;
  literature_review?: string;
  methodology?: string;
  results_or_expected_results?: string;
  discussion?: string;
  conclusion?: string;
  limitations?: string;
  references?: unknown[];
  full_text_markdown?: string;
  factual_basis?: FactualBasis;
  human_work_needed?: HumanWorkItem[];
  reviewer_notes?: unknown[];
  is_draft?: boolean;
  created_by_role?: string;
  model_used?: string;
};

export type AIRoleReview = {
  id?: string;
  article_project_id: string;
  article_version_id?: string;
  ai_role: AiRole;
  model_used?: string;
  strengths?: string;
  weaknesses?: string;
  factual_risks?: string;
  methodological_risks?: string;
  literature_gaps?: string;
  journal_fit_assessment?: string;
  recommendations?: unknown[];
  raw_output?: Record<string, unknown>;
};

export type LiteratureSource = {
  id?: string;
  article_project_id: string;
  citation?: string;
  doi?: string;
  url?: string;
  source_type: "verified_db" | "user_provided" | "ai_suggested_unverified";
  verified: boolean;
  relevance_note?: string;
};

export type PublicationPipelineRun = {
  id?: string;
  month: string;
  article_project_id?: string;
  selected_topic_id?: string;
  status: "planned" | "running" | "paused" | "completed" | "failed";
  current_step?: string;
  summary?: string;
  run_log?: unknown[];
};

export type PipelineLogEntry = {
  at: string;
  step: AiRole | "system";
  level: "info" | "warn" | "error";
  message: string;
  detail?: unknown;
};

export const DEFAULT_REVISION_CHECKLIST: HumanRevisionChecklistItem[] = [
  { id: "rq_clear", question: "Je jasná výzkumná otázka?", checked: false },
  { id: "original_contribution", question: "Je zřejmý originální přínos?", checked: false },
  { id: "journal_scope", question: "Odpovídá článek scope cílového časopisu?", checked: false },
  { id: "citations_verified", question: "Jsou všechny citace ověřené?", checked: false },
  { id: "no_fabricated_sources", question: "Neobsahuje text vymyšlené zdroje?", checked: false },
  { id: "methodology_strong", question: "Je metodologie dostatečně silná?", checked: false },
  { id: "results_evidence", question: "Jsou výsledky podloženy daty?", checked: false },
  { id: "human_work_clear", question: "Je jasně uvedeno, co musí doplnit člověk?", checked: false },
  { id: "publication_ethics", question: "Je dodržena publikační etika?", checked: false },
  { id: "ai_policy_journal", question: "Byla ověřena pravidla cílového časopisu pro použití AI?", checked: false },
  { id: "originality_check", question: "Byla provedena kontrola originality?", checked: false },
  { id: "ready_human_review", question: "Je text připraven pro odbornou lidskou revizi?", checked: false },
];

export const EMPTY_FACTUAL_BASIS: FactualBasis = {
  verified_facts: [],
  interpretations: [],
  hypotheses: [],
  proposals: [],
  unverified: [],
};
