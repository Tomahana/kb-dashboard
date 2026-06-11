// Analýza databáze časopisů — pořadí podle AIS v oboru a roce, decily, centily, kvartily, nejlepší výsledek napříč obory v rámci roku.

(function () {
  const METRIC_FIELDS = [
    "category_journal_count", "ais_rank", "ais_rank_ratio", "ais_rank_fraction",
    "ais_percentile_band", "ais_decile", "ais_centile", "ais_quartile"
  ];

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

  function clearRankMetrics(row) {
    METRIC_FIELDS.forEach((field) => { delete row[field]; });
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
        map.set(key, row);
        continue;
      }
      const existingAis = parseNumber(existing.ais);
      if (ais != null && (existingAis == null || ais > existingAis)) {
        map.set(key, row);
      }
    }
    return [...map.values()];
  }

  function rankRecordsInPlace(rows) {
    rows.forEach(clearRankMetrics);
    const deduped = dedupeCategoryRows(rows);
    const byYearCategory = new Map();
    const categoryStats = new Map();

    for (const row of deduped) {
      const category = n(row.category) || "—";
      const sourceYear = resolveSourceYear(row);
      const groupKey = `${sourceYear}|${category}`;
      if (!byYearCategory.has(groupKey)) byYearCategory.set(groupKey, []);
      byYearCategory.get(groupKey).push(row);
    }

    const metricsBySourceKey = new Map();

    for (const [groupKey, items] of byYearCategory.entries()) {
      const sourceYear = resolveSourceYear(items[0]);
      const category = n(items[0]?.category) || "—";
      const sorted = items.sort((a, b) => {
        const aisA = parseNumber(a.ais);
        const aisB = parseNumber(b.ais);
        if (aisA == null && aisB == null) return compareJournalName(a, b);
        if (aisA == null) return 1;
        if (aisB == null) return -1;
        if (aisB !== aisA) return aisB - aisA;
        return compareJournalName(a, b);
      });

      const total = sorted.length;
      let withAis = 0;
      let aisSum = 0;
      let topAis = null;
      let topJournal = "—";

      sorted.forEach((entry, index) => {
        const rank = index + 1;
        const metrics = classifyFromRatio(rank, total);
        metricsBySourceKey.set(entry.source_key, metrics);
        const ais = parseNumber(entry.ais);
        if (ais != null) {
          withAis += 1;
          aisSum += ais;
          if (topAis == null || ais > topAis) {
            topAis = ais;
            topJournal = n(entry.journal_name) || n(entry.jcr_abbreviation) || "—";
          }
        }
      });

      categoryStats.set(groupKey, {
        source_year: sourceYear,
        category,
        journal_count: total,
        with_ais: withAis,
        avg_ais: withAis ? Math.round((aisSum / withAis) * 1000) / 1000 : null,
        top_journal: topJournal,
        top_ais: topAis
      });
    }

    rows.forEach((row) => {
      const metrics = metricsBySourceKey.get(row.source_key);
      if (metrics) Object.assign(row, metrics);
    });

    return [...categoryStats.values()].sort((a, b) =>
      b.source_year.localeCompare(a.source_year, "cs") || a.category.localeCompare(b.category, "cs")
    );
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

  function aggregateBestResults(rows) {
    const byKey = new Map();
    const ranked = rows.filter((row) => row.ais_rank && makeJournalKey(row));

    for (const row of ranked) {
      const journalKey = row.journal_key || makeJournalKey(row);
      const sourceYear = resolveSourceYear(row);
      const aggKey = `${sourceYear}|${journalKey}`;
      const existing = byKey.get(aggKey);
      if (!existing) {
        byKey.set(aggKey, {
          id: row.id,
          journal_key: journalKey,
          journal_name: row.journal_name,
          jcr_abbreviation: row.jcr_abbreviation,
          issn: row.issn,
          eissn: row.eissn,
          source_year: sourceYear === "—" ? row.source_year : sourceYear,
          category_count: 1,
          categories_seen: [n(row.category)].filter(Boolean),
          best_category: row.category,
          best_ais: parseNumber(row.ais),
          best_source_year: sourceYear === "—" ? row.source_year : sourceYear,
          best_ais_rank: row.ais_rank,
          best_ais_rank_ratio: row.ais_rank_ratio,
          best_ais_rank_fraction: row.ais_rank_fraction,
          best_ais_percentile_band: row.ais_percentile_band,
          best_ais_quartile: row.ais_quartile,
          best_ais_decile: row.ais_decile,
          best_ais_centile: row.ais_centile,
          category_journal_count: row.category_journal_count,
          best_jif: parseNumber(row.jif),
          best_jif_year: row.jif_year,
          best_jif_percentile: parseNumber(row.jif_percentile)
        });
        continue;
      }

      existing.category_count += 1;
      if (row.category && !existing.categories_seen.includes(row.category)) {
        existing.categories_seen.push(row.category);
      }

      if (isBetterRow(row, existing)) {
        existing.best_category = row.category;
        existing.best_ais = parseNumber(row.ais);
        existing.best_ais_rank = row.ais_rank;
        existing.best_ais_rank_ratio = row.ais_rank_ratio;
        existing.best_ais_rank_fraction = row.ais_rank_fraction;
        existing.best_ais_percentile_band = row.ais_percentile_band;
        existing.best_ais_quartile = row.ais_quartile;
        existing.best_ais_decile = row.ais_decile;
        existing.best_ais_centile = row.ais_centile;
        existing.category_journal_count = row.category_journal_count;
        existing.best_jif = parseNumber(row.jif);
        existing.best_jif_year = row.jif_year;
        existing.best_jif_percentile = parseNumber(row.jif_percentile);
      }
    }

    return [...byKey.values()];
  }

  function runAnalysis(rawRows) {
    const categories = rankRecordsInPlace(rawRows);
    const best = aggregateBestResults(rawRows);
    return { best, categories };
  }

  function lookupBestJournal(journalRef, bestRows, sourceYear) {
    const ref = applyJournalIdentity({
      issn: journalRef.issn,
      eissn: journalRef.eissn
    });
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
    rankRecordsInPlace,
    aggregateBestResults,
    runAnalysis,
    lookupBestJournal
  };
})();
