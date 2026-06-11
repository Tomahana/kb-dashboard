// Analýza databáze časopisů — pořadí podle AIS v oboru, decily, centily, kvartily, nejlepší výsledek napříč výskyty.

(function () {
  const n = (s) => (s || "").toString().trim();
  const l = (s) => n(s).toLowerCase();

  function parseNumber(value) {
    const v = n(value).replace(/\s/g, "").replace(",", ".");
    if (!v || v === "-" || v === "—" || v === "N/A" || v === "n/a") return null;
    const num = Number(v);
    return Number.isFinite(num) ? num : null;
  }

  function normalizeIssn(value) {
    const v = n(value).replace(/\s/g, "").toUpperCase();
    if (!v || v === "-" || v === "—") return "";
    const digits = v.replace(/[^0-9X]/gi, "");
    if (digits.length === 8) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
    return v;
  }

  function makeJournalKey(row) {
    const issn = normalizeIssn(row.issn);
    const eissn = normalizeIssn(row.eissn);
    if (issn) return `issn:${issn}`;
    if (eissn) return `eissn:${eissn}`;
    const abbr = l(row.jcr_abbreviation);
    if (abbr) return `abbr:${abbr}`;
    const name = l(row.journal_name);
    if (name) return `name:${name}`;
    return "";
  }

  function compareJournalName(a, b) {
    return l(a.journal_name || a.jcr_abbreviation).localeCompare(
      l(b.journal_name || b.jcr_abbreviation),
      "cs"
    );
  }

  function bucketFromRank(rank, total, buckets) {
    const safeTotal = Math.max(1, total);
    return Math.min(buckets, Math.max(1, Math.floor(((rank - 1) * buckets) / safeTotal) + 1));
  }

  function assignRankMetrics(entry, rank, total) {
    const safeTotal = Math.max(1, total);
    const ratio = rank / safeTotal;
    const percentileTop = ((safeTotal - rank + 1) / safeTotal) * 100;

    entry.category_journal_count = total;
    entry.ais_rank = rank;
    entry.ais_rank_ratio = Math.round(ratio * 10000) / 10000;
    entry.ais_percentile_top = Math.round(percentileTop * 10) / 10;
    entry.ais_quartile_rank = bucketFromRank(rank, safeTotal, 4);
    entry.ais_decile_rank = bucketFromRank(rank, safeTotal, 10);
    entry.ais_centile_rank = bucketFromRank(rank, safeTotal, 100);
  }

  function dedupeCategoryRows(rows) {
    const map = new Map();
    for (const row of rows) {
      const category = n(row.category) || "—";
      const key = `${category}|${makeJournalKey(row)}`;
      const existing = map.get(key);
      const ais = parseNumber(row.ais);
      if (!existing) {
        map.set(key, { ...row, category });
        continue;
      }
      const existingAis = parseNumber(existing.ais);
      if (ais != null && (existingAis == null || ais > existingAis)) {
        map.set(key, { ...row, category, ...pickSourceMeta(existing, row) });
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
    const byCategory = new Map();

    for (const row of deduped) {
      const category = n(row.category) || "—";
      if (!byCategory.has(category)) byCategory.set(category, []);
      byCategory.get(category).push(row);
    }

    const analyzed = [];

    for (const [category, items] of byCategory.entries()) {
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
    const categoryTotal = row.category_journal_count || 999999;

    return {
      ais: ais == null ? -Infinity : ais,
      jifPercentile: jifPercentile == null ? -Infinity : jifPercentile,
      jif: jif == null ? -Infinity : jif,
      rank,
      categoryTotal
    };
  }

  function isBetterRow(candidate, current) {
    const c = scoreRowForBest(candidate);
    const cur = scoreRowForBest(current);
    if (c.ais !== cur.ais) return c.ais > cur.ais;
    if (c.jifPercentile !== cur.jifPercentile) return c.jifPercentile > cur.jifPercentile;
    if (c.jif !== cur.jif) return c.jif > cur.jif;
    if (c.rank !== cur.rank) return c.rank < cur.rank;
    return c.categoryTotal < cur.categoryTotal;
  }

  function aggregateBestResults(analyzedRows) {
    const byKey = new Map();

    for (const row of analyzedRows) {
      const key = row.journal_key || makeJournalKey(row);
      if (!key) continue;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, {
          ...row,
          occurrence_count: 1,
          categories_seen: uniqueList([row.category]),
          source_years_seen: uniqueList([...(row.source_years || []), row.source_year]),
          source_files_seen: uniqueList([...(row.source_files || []), row.source_file])
        });
        continue;
      }

      existing.occurrence_count += 1;
      existing.categories_seen = uniqueList([...(existing.categories_seen || []), row.category]);
      existing.source_years_seen = uniqueList([
        ...(existing.source_years_seen || []),
        ...(row.source_years || []),
        row.source_year
      ]);
      existing.source_files_seen = uniqueList([
        ...(existing.source_files_seen || []),
        ...(row.source_files || []),
        row.source_file
      ]);

      if (isBetterRow(row, existing)) {
        byKey.set(key, {
          ...row,
          occurrence_count: existing.occurrence_count,
          categories_seen: existing.categories_seen,
          source_years_seen: existing.source_years_seen,
          source_files_seen: existing.source_files_seen
        });
      }
    }

    return [...byKey.values()].map((row) => ({
      ...row,
      best_ais: parseNumber(row.ais),
      best_category: row.category,
      best_ais_rank: row.ais_rank,
      best_ais_rank_ratio: row.ais_rank_ratio,
      best_ais_percentile_top: row.ais_percentile_top,
      best_ais_quartile: row.ais_quartile_rank,
      best_ais_decile: row.ais_decile_rank,
      best_ais_centile: row.ais_centile_rank,
      best_jif: parseNumber(row.jif),
      best_jif_year: row.jif_year,
      best_jif_percentile: parseNumber(row.jif_percentile)
    }));
  }

  function summarizeCategories(analyzedRows) {
    const map = new Map();
    for (const row of analyzedRows) {
      const category = n(row.category) || "—";
      if (!map.has(category)) {
        map.set(category, {
          category,
          journal_count: row.category_journal_count || 0,
          with_ais: 0,
          avg_ais: null,
          top_journal: null,
          top_ais: null
        });
      }
      const bucket = map.get(category);
      const ais = parseNumber(row.ais);
      if (ais != null) bucket.with_ais += 1;
      if (bucket.top_ais == null || (ais != null && ais > bucket.top_ais)) {
        bucket.top_ais = ais;
        bucket.top_journal = n(row.journal_name) || n(row.jcr_abbreviation) || "—";
      }
    }

    for (const bucket of map.values()) {
      const rows = analyzedRows.filter((r) => n(r.category) === bucket.category);
      const aisValues = rows.map((r) => parseNumber(r.ais)).filter((v) => v != null);
      bucket.avg_ais = aisValues.length
        ? Math.round((aisValues.reduce((a, b) => a + b, 0) / aisValues.length) * 1000) / 1000
        : null;
      bucket.journal_count = rows[0]?.category_journal_count || rows.length;
    }

    return [...map.values()].sort((a, b) => a.category.localeCompare(b.category, "cs"));
  }

  function runAnalysis(rawRows) {
    const analyzed = rankByCategory(rawRows);
    const best = aggregateBestResults(analyzed);
    const categories = summarizeCategories(analyzed);
    return { analyzed, best, categories };
  }

  function lookupBestJournal(journalRef, bestRows) {
    const keyFromRef = makeJournalKey({
      issn: journalRef.issn,
      eissn: journalRef.eissn,
      jcr_abbreviation: journalRef.jcr_abbreviation,
      journal_name: journalRef.journal_name || journalRef.nazev || journalRef.casopis
    });
    if (!keyFromRef) return null;
    return bestRows.find((row) => row.journal_key === keyFromRef) || null;
  }

  window.kbJournalDbAnalysis = {
    parseNumber,
    normalizeIssn,
    makeJournalKey,
    rankByCategory,
    aggregateBestResults,
    summarizeCategories,
    runAnalysis,
    lookupBestJournal
  };
})();
