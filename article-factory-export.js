// Article Factory — export rukopisu do Markdown (MVP). DOCX: TODO.

(function () {
  const n = (s) => (s || "").toString().trim();

  function formatFactualBasis(fb) {
    if (!fb || typeof fb !== "object") return "_No factual basis recorded._\n";
    const lines = [];
    const sections = [
      ["verified_facts", "Verified facts"],
      ["interpretations", "Interpretations"],
      ["hypotheses", "Hypotheses"],
      ["proposals", "Proposals"],
      ["unverified", "Unverified / nutno ověřit"]
    ];
    for (const [key, title] of sections) {
      const items = Array.isArray(fb[key]) ? fb[key] : [];
      if (!items.length) continue;
      lines.push(`### ${title}`, "");
      items.forEach((item) => {
        const claim = typeof item === "string" ? item : item.claim || JSON.stringify(item);
        const status = item.verification_status ? ` (${item.verification_status})` : "";
        lines.push(`- ${claim}${status}`);
      });
      lines.push("");
    }
    return lines.join("\n") || "_Empty factual basis._\n";
  }

  function formatHumanWork(items) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return "_No human work items._\n";
    return list.map((item) => {
      if (typeof item === "string") return `- ${item}`;
      const pri = item.priority ? ` **[${item.priority}]**` : "";
      return `- ${item.task || item}${pri}${item.reason ? ` — ${item.reason}` : ""}`;
    }).join("\n") + "\n";
  }

  function formatChecklist(checklist) {
    const list = Array.isArray(checklist) ? checklist : [];
    if (!list.length) return "";
    const lines = ["## Human Revision Checklist (CS)", ""];
    list.forEach((item) => {
      const q = item.question || item;
      const checked = item.checked ? "x" : " ";
      lines.push(`- [${checked}] ${q}`);
    });
    lines.push("");
    return lines.join("\n");
  }

  function formatReviews(reviews) {
    if (!reviews?.length) return "";
    const lines = ["## AI Reviewer Notes", ""];
    reviews.forEach((r) => {
      lines.push(`### ${r.ai_role || "review"}`, "");
      if (r.strengths) lines.push(`**Strengths:** ${r.strengths}`, "");
      if (r.weaknesses) lines.push(`**Weaknesses:** ${r.weaknesses}`, "");
      if (r.factual_risks) lines.push(`**Factual risks:** ${r.factual_risks}`, "");
      if (r.methodological_risks) lines.push(`**Methodological risks:** ${r.methodological_risks}`, "");
      if (r.journal_fit_assessment) lines.push(`**Journal fit:** ${r.journal_fit_assessment}`, "");
    });
    return lines.join("\n");
  }

  function buildMarkdown(version, project, reviews, checklist) {
    const title = n(version?.title) || n(project?.working_title) || "Untitled manuscript";
    const lines = [
      `# ${title}`,
      "",
      "> **DRAFT — NOT FOR SUBMISSION**",
      "> AI-assisted draft requiring human revision. This document does not constitute a final article.",
      "",
      `*Exported: ${new Date().toISOString()}*`,
      `*Project status: ${project?.status || "unknown"}*`,
      "",
    ];

    const sections = window.kbArticleFactoryTypes?.MANUSCRIPT_SECTIONS || [];
    if (n(version?.full_text_markdown)) {
      lines.push(version.full_text_markdown, "");
    } else {
      sections.forEach(({ key, label }) => {
        const body = n(version?.[key]);
        if (!body) return;
        lines.push(`## ${label}`, "", body, "");
      });
    }

    if (version?.references?.length) {
      lines.push("## References", "");
      version.references.forEach((ref, i) => {
        if (typeof ref === "string") lines.push(`${i + 1}. ${ref}`);
        else lines.push(`${i + 1}. ${ref.citation || JSON.stringify(ref)}`);
      });
      lines.push("");
    }

    lines.push("## Factual Basis", "", formatFactualBasis(version?.factual_basis));
    lines.push("## Human Work Needed", "", formatHumanWork(version?.human_work_needed));
    lines.push(formatReviews(reviews));
    lines.push(formatChecklist(checklist || project?.revision_checklist));

    lines.push("---", "", "_DOCX export: TODO (planned for later phase)._", "");

    return lines.join("\n");
  }

  function downloadMarkdown(filename, content) {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportVersion(version, project, reviews) {
    const md = buildMarkdown(version, project, reviews, project?.revision_checklist);
    const safe = (version?.title || "manuscript").replace(/[^\w\-]+/g, "_").slice(0, 60);
    downloadMarkdown(`${safe}_v${version?.version_number || 1}.md`, md);
    return md;
  }

  window.kbArticleFactoryExport = {
    buildMarkdown,
    exportVersion,
    downloadMarkdown
  };
})();
