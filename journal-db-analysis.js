// Analýza databáze časopisů — pořadí podle AIS v oboru a roce, decily, centily, kvartily, nejlepší výsledek napříč obory v rámci roku.

(function () {
  const n = (s) => (s || "").toString().trim();
  const l = (s) => n(s).toLowerCase();

  function resolveSourceYear(row) {
    return n(row.source_year) || n(row.jif_year) || "—";
  }

  function parseNumber(value) {
    const v = n(value).replace(/\s/g, "").replace(",", ".");
    if (!v || v === "-" || v === "—" || v === "N/A" || v === "n/a") return null;
    const num = Number(v);
    return Number.isFinite(num) ? num : null;
  }

  function normalizeIssn(value) {
    const v = n(value).replace(/\s/g, "").toUpperCase();
    if (!v || v === "-" || v === "—" || /^N\/A$/i.test(v) || v === "NA") return "";
    const digits = v.replace(/[^0-9X]/gi, "");
    if (!digits || digits.length !== 8 || /^0+$/.test(digits)) return "";
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }

  function makeJournalKey(row) {
    const issn = normalizeIssn(row.issn);
    const eissn = normalizeIssn(row.eissn);
    if (issn) return `issn:${issn}`;
    if (eissn) return `eissn:${eissn}`;
    return "";
  }

  function hasJournalKey(row) {
    return !!makeJournalKey(row);
  }

  function applyJournalIdentity(row) {
    const issn = normalizeIssn(row.issn);
    const eissn = normalizeIssn(row.eissn);
    return {
      ...row,
      issn,
      eissn,
      journal_key: makeJournalKey({ issn, eissn })
    };
  }

  function compareJournalName(a, b) {
    return l(a.journal_name || a.jcr_abbreviation).localeCompare(
      l(b.journal_name || b.jcr_abbreviation),
      "cs"
    );
  }

  function classifyFromRatio(rank, total) {
    const safeTotal = Math.max(1, total);
    const ratio = rank / safeTotal;
    const roundedRatio = Math.round(ratio * 1000000) / 1000000;

    let percentileBand = "";
    if (ratio <= 0.01) percentileBand = "P1";
    else if (ratio <= 0.05) percentileBand = "P5";

    const decileNum = Math.min(10, Math.max(1, Math.ceil(ratio * 10)));
    const centileNum = Math.min(100, Math.max(1, Math.ceil(ratio * 100)));
    const quartileNum = Math.min(4, Math.max(1, Math.ceil(ratio * 4)));

    return {
      category_journal_count: total,
      ais_rank: rank,
      ais_rank_ratio: roundedRatio,
      ais_rank_fraction: `${rank}/${safeTotal}`,
      ais_percentile_band: percentileBand,
      ais_decile: `D${decileNum}`,
      ais_centile: `C${centileNum}`,
      ais_quartile: `Q${quartileNum}`
    };
  }

  function assignRankMetrics(entry, rank, total) {
    Object.assign(entry, classifyFromRatio(rank, total));
  }

  function dedupeCategoryRows(rows) {
    const map = new Map();
    for (const row of rows) {
      const journalKey = makeJournalKey(row);
      if (!journalKey) continue;
      const category = n(row.category) || "—";
      const sourceYear = resolveSourceYear(row);
      const key = `${sourceYear}|${category}|${journalKey}`;
      const existing = map.get(key);
      const ais = parseNumber(row.ais);
      if (!existing) {
        map.set(key, { ...row, category, source_year: sourceYear === "—" ? row.source_year : sourceYear });
        continue;
      }
      const existingAis = parseNumber(existing.ais);
      if (ais != null && (existingAis == null || ais > existingAis)) {
        map.set(key, { ...row, category, source_year: sourceYear === "—" ? row.source_year : sourceYear, ...pickSourceMeta(existing, row) });
      } else {
        map.set(key, { ...existing, ...pickSourceMeta(existing, row) });
      }
    }
    return [...map.values()];
  }

  function pickSourceMeta(primary, secondary) {
    return {
      source_years: uniqueList([...(primary.source_years || []), ...(secondary.source_years || []), primary.source_year, secondary.source_year]),
      source_files: uniqueList([...(primary.source_files || []), ...(secondary.source_files || []), primary.source_file, secondary.source_file])
    };
  }

  function uniqueList(values) {
    return [...new Set(values.map(n).filter(Boolean))];
  }

  function rankByCategory(rows) {
    const deduped = dedupeCategoryRows(rows);
    const byYearCategory = new Map();

    for (const row of deduped) {
      const journalKey = makeJournalKey(row);
      if (!journalKey) continue;
      const category = n(row.category) || "—";
      const sourceYear = resolveSourceYear(row);
      const groupKey = `${sourceYear}|${category}`;
      if (!byYearCategory.has(groupKey)) byYearCategory.set(groupKey, []);
      byYearCategory.get(groupKey).push(row);
    }

    const analyzed = [];

    for (const [, items] of byYearCategory.entries()) {
      const sourceYear = resolveSourceYear(items[0]);
      const category = n(items[0]?.category) || "—";
      const sorted = [...items].sort((a, b) => {
        const aisA = parseNumber(a.ais);
        const aisB = parseNumber(b.ais);
        if (aisA == null && aisB == null) return compareJournalName(a, b);
        if (aisA == null) return 1;
        if (aisB == null) return -1;
        if (aisB !== aisA) return aisB - aisA;
        return compareJournalName(a, b);
      });

      const total = sorted.length;
      sorted.forEach((entry, index) => {
        const rank = index + 1;
        assignRankMetrics(entry, rank, total);
        analyzed.push({
          ...entry,
          category,
          source_year: sourceYear === "—" ? entry.source_year : sourceYear,
          journal_key: makeJournalKey(entry)
        });
      });
    }

    return analyzed;
  }

  function scoreRowForBest(row) {
    const ais = parseNumber(row.ais);
    const jifPercentile = parseNumber(row.jif_percentile);
    const jif = parseNumber(row.jif);
    const rank = row.ais_rank || 999999;
    const ratio = row.ais_rank_ratio ?? 1;

    return {
      ais: ais == null ? -Infinity : ais,
      jifPercentile: jifPercentile == null ? -Infinity : jifPercentile,
      jif: jif == null ? -Infinity : jif,
      rank,
      ratio
    };
  }

  function isBetterRow(candidate, current) {
    const c = scoreRowForBest(candidate);
    const cur = scoreRowForBest(current);
    if (c.ais !== cur.ais) return c.ais > cur.ais;
    if (c.jifPercentile !== cur.jifPercentile) return c.jifPercentile > cur.jifPercentile;
    if (c.jif !== cur.jif) return c.jif > cur.jif;
    if (c.rank !== cur.rank) return c.rank < cur.rank;
    return c.ratio < cur.ratio;
  }

  function aggregateBestResults(analyzedRows) {
    const byKey = new Map();

    for (const row of analyzedRows) {
      const journalKey = row.journal_key || makeJournalKey(row);
      if (!journalKey) continue;
      const sourceYear = resolveSourceYear(row);
      const aggKey = `${sourceYear}|${journalKey}`;
      const existing = byKey.get(aggKey);
      if (!existing) {
        byKey.set(aggKey, {
          ...row,
          source_year: sourceYear === "—" ? row.source_year : sourceYear,
          category_count: 1,
          categories_seen: uniqueList([row.category]),
          source_files_seen: uniqueList([...(row.source_files || []), row.source_file])
        });
        continue;
      }

      existing.category_count += 1;
      existing.categories_seen = uniqueList([...(existing.categories_seen || []), row.category]);
      existing.source_files_seen = uniqueList([
        ...(existing.source_files_seen || []),
        ...(row.source_files || []),
        row.source_file
      ]);

      if (isBetterRow(row, existing)) {
        byKey.set(aggKey, {
          ...row,
          source_year: sourceYear === "—" ? row.source_year : sourceYear,
          category_count: existing.category_count,
          categories_seen: existing.categories_seen,
          source_files_seen: existing.source_files_seen
        });
      }
    }

    return [...byKey.values()].map((row) => ({
      ...row,
      best_ais: parseNumber(row.ais),
      best_category: row.category,
      best_source_year: resolveSourceYear(row),
      best_ais_rank: row.ais_rank,
      best_ais_rank_ratio: row.ais_rank_ratio,
      best_ais_rank_fraction: row.ais_rank_fraction,
      best_ais_percentile_band: row.ais_percentile_band,
      best_ais_quartile: row.ais_quartile,
      best_ais_decile: row.ais_decile,
      best_ais_centile: row.ais_centile,
      best_jif: parseNumber(row.jif),
      best_jif_year: row.jif_year,
      best_jif_percentile: parseNumber(row.jif_percentile)
    }));
  }

  function summarizeCategories(analyzedRows) {
    const map = new Map();
    for (const row of analyzedRows) {
      const category = n(row.category) || "—";
      const sourceYear = resolveSourceYear(row);
      const key = `${sourceYear}|${category}`;
      if (!map.has(key)) {
        map.set(key, {
          source_year: sourceYear,
          category,
          journal_count: row.category_journal_count || 0,
          with_ais: 0,
          avg_ais: null,
          top_journal: null,
          top_ais: null
        });
      }
      const bucket = map.get(key);
      const ais = parseNumber(row.ais);
      if (ais != null) bucket.with_ais += 1;
      if (bucket.top_ais == null || (ais != null && ais > bucket.top_ais)) {
        bucket.top_ais = ais;
        bucket.top_journal = n(row.journal_name) || n(row.jcr_abbreviation) || "—";
      }
    }

    for (const bucket of map.values()) {
      const rows = analyzedRows.filter((r) =>
        n(r.category) === bucket.category && resolveSourceYear(r) === bucket.source_year
      );
      const aisValues = rows.map((r) => parseNumber(r.ais)).filter((v) => v != null);
      bucket.avg_ais = aisValues.length
        ? Math.round((aisValues.reduce((a, b) => a + b, 0) / aisValues.length) * 1000) / 1000
        : null;
      bucket.journal_count = rows[0]?.category_journal_count || rows.length;
    }

    return [...map.values()].sort((a, b) =>
      b.source_year.localeCompare(a.source_year, "cs") || a.category.localeCompare(b.category, "cs")
    );
  }

  function runAnalysis(rawRows) {
    const analyzed = rankByCategory(rawRows);
    const best = aggregateBestResults(analyzed);
    const categories = summarizeCategories(analyzed);
    return { analyzed, best, categories };
  }

  function lookupBestJournal(journalRef, bestRows, sourceYear) {
    const ref = window.kbJournalDbAnalysis?.applyJournalIdentity?.({
      issn: journalRef.issn,
      eissn: journalRef.eissn
    }) || journalRef;
    const keyFromRef = makeJournalKey(ref);
    if (!keyFromRef) return null;
    const year = n(sourceYear || journalRef.source_year || journalRef.best_source_year);
    const matches = bestRows.filter((row) => row.journal_key === keyFromRef);
    if (!matches.length) return null;
    if (year) return matches.find((row) => resolveSourceYear(row) === year) || null;
    return matches.sort((a, b) => resolveSourceYear(b).localeCompare(resolveSourceYear(a), "cs"))[0];
  }

  window.kbJournalDbAnalysis = {
    parseNumber,
    normalizeIssn,
    makeJournalKey,
    hasJournalKey,
    applyJournalIdentity,
    resolveSourceYear,
    classifyFromRatio,
    rankByCategory,
    aggregateBestResults,
    summarizeCategories,
    runAnalysis,
    lookupBestJournal
  };
})();
