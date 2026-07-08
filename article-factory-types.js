// Article Factory — sdílené typy, konstanty a checklist (JSDoc pro IDE).

(function () {
  /**
   * @typedef {Object} Publication
   * @property {string} id
   * @property {string} title
   * @property {string} [authors]
   * @property {number|null} [year]
   * @property {string} [journal_or_publisher]
   * @property {string} [doi]
   * @property {string} [abstract]
   * @property {string} [keywords]
   * @property {string} [methodology]
   * @property {string} [main_findings]
   * @property {string} [notes]
   */

  /**
   * @typedef {Object} PublicationTopic
   * @property {string} id
   * @property {string} title
   * @property {string} [description]
   * @property {string} [research_area]
   * @property {number} [priority]
   * @property {string} [status]
   */

  /**
   * @typedef {Object} ArticleProject
   * @property {string} id
   * @property {string} [topic_id]
   * @property {string} [working_title]
   * @property {string} [target_journal_id]
   * @property {string} [research_question]
   * @property {string} [status]
   * @property {string} [current_version_id]
   */

  const AI_ROLES = [
    { id: "research_strategist", label: "Research Strategist" },
    { id: "literature_scout", label: "Literature Scout" },
    { id: "methodology_designer", label: "Methodology Designer" },
    { id: "manuscript_writer", label: "Manuscript Writer" },
    { id: "critical_reviewer", label: "Critical Reviewer" },
    { id: "journal_fit_reviewer", label: "Journal Fit Reviewer" },
    { id: "integrity_reviewer", label: "Integrity Reviewer" },
    { id: "final_revision_assistant", label: "Final Human-Revision Assistant" }
  ];

  const PROJECT_STATUSES = [
    "planning", "literature", "drafting", "reviewing", "human_revision",
    "ready_for_submission", "submitted", "archived"
  ];

  const MANUSCRIPT_SECTIONS = [
    { key: "title", label: "Title" },
    { key: "abstract", label: "Abstract" },
    { key: "keywords", label: "Keywords" },
    { key: "introduction", label: "Introduction" },
    { key: "literature_review", label: "Literature Review" },
    { key: "methodology", label: "Methodology" },
    { key: "results_or_expected_results", label: "Results / Expected Results" },
    { key: "discussion", label: "Discussion" },
    { key: "conclusion", label: "Conclusion" },
    { key: "limitations", label: "Limitations" }
  ];

  const REVISION_CHECKLIST = [
    { id: "rq_clear", question: "Je jasná výzkumná otázka?" },
    { id: "original_contribution", question: "Je zřejmý originální přínos?" },
    { id: "journal_scope", question: "Odpovídá článek scope cílového časopisu?" },
    { id: "citations_verified", question: "Jsou všechny citace ověřené?" },
    { id: "no_fabricated_sources", question: "Neobsahuje text vymyšlené zdroje?" },
    { id: "methodology_strong", question: "Je metodologie dostatečně silná?" },
    { id: "results_evidence", question: "Jsou výsledky podloženy daty?" },
    { id: "human_work_clear", question: "Je jasně uvedeno, co musí doplnit člověk?" },
    { id: "publication_ethics", question: "Je dodržena publikační etika?" },
    { id: "ai_policy_journal", question: "Byla ověřena pravidla cílového časopisu pro použití AI?" },
    { id: "originality_check", question: "Byla provedena kontrola originality?" },
    { id: "ready_human_review", question: "Je text připraven pro odbornou lidskou revizi?" }
  ];

  const EMPTY_FACTUAL_BASIS = {
    verified_facts: [],
    interpretations: [],
    hypotheses: [],
    proposals: [],
    unverified: []
  };

  window.kbArticleFactoryTypes = {
    AI_ROLES,
    PROJECT_STATUSES,
    MANUSCRIPT_SECTIONS,
    REVISION_CHECKLIST,
    EMPTY_FACTUAL_BASIS
  };
})();
