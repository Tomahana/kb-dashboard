// Číselník pracovišť UHK — načtení kb_pracoviste, vyhledávání a odvození fakulty/katedry.

(function () {
  const STORAGE_KEY = "kb-dashboard-pracoviste-v1";
  const FAKULTA_ZKR = {
    fim: "FIM",
    "fakulta informatiky": "FIM",
    "informatiky a managementu": "FIM",
    ff: "FF",
    filozofick: "FF",
    fsv: "FSV",
    "sociálních věd": "FSV",
    pdf: "PdF",
    pedagogick: "PdF",
    fhk: "FHK",
    humanitní: "FHK",
    přírodovědeck: "PdF"
  };

  let items = [];
  let byKod = new Map();
  let useSupabase = false;
  let loading = false;
  let loaded = false;

  const n = (s) => (s || "").toString().trim();
  const l = (s) => n(s).toLowerCase();

  function getClient() {
    if (window.kbAuth?.getClient) return window.kbAuth.getClient();
    if (window.kbSupabase?.getClient) return window.kbSupabase.getClient();
    if (!window.KB_SUPABASE?.url || !window.KB_SUPABASE?.anonKey) throw new Error("Chybí supabase-config.js.");
    return window.supabase.createClient(window.KB_SUPABASE.url, window.KB_SUPABASE.anonKey);
  }

  function inferZkrFak(text) {
    const t = l(text);
    if (!t) return "";
    if (/^[A-Z]{2,5}$/.test(n(text))) return n(text).toUpperCase();
    for (const [key, zkr] of Object.entries(FAKULTA_ZKR)) {
      if (t.includes(key)) return zkr;
    }
    return "";
  }

  function mapRow(row) {
    return {
      kodorg: n(row.kodorg),
      nazev: n(row.nazev),
      kodorg_rodic: n(row.kodorg_rodic) || null,
      nazev_rodic: n(row.nazev_rodic),
      cesta: n(row.cesta) || n(row.nazev),
      updated_at: row.updated_at
    };
  }

  function rebuildIndex(list) {
    items = list;
    byKod = new Map(list.map((item) => [item.kodorg, item]));
    loaded = true;
  }

  function persistLocal() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items, null, 2));
  }

  async function probeTables() {
    try {
      const { error } = await getClient().from("kb_pracoviste").select("kodorg").limit(1);
      return !error || error.code !== "PGRST205";
    } catch (_) {
      return false;
    }
  }

  async function loadAll() {
    if (loading) return items;
    loading = true;
    try {
      useSupabase = await probeTables();
      if (useSupabase) {
        const PAGE = 1000;
        const all = [];
        for (let from = 0; ; from += PAGE) {
          const { data, error } = await getClient()
            .from("kb_pracoviste_prehled")
            .select("kodorg, nazev, kodorg_rodic, nazev_rodic, cesta, updated_at")
            .order("nazev")
            .range(from, from + PAGE - 1);
          if (error) throw error;
          const batch = data || [];
          all.push(...batch.map(mapRow));
          if (batch.length < PAGE) break;
        }
        rebuildIndex(all);
        persistLocal();
      } else {
        try {
          const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
          rebuildIndex(Array.isArray(parsed) ? parsed.map(mapRow) : []);
        } catch (_) {
          rebuildIndex([]);
        }
      }
      document.dispatchEvent(new CustomEvent("kb:pracoviste-loaded", { detail: { count: items.length } }));
      return items;
    } finally {
      loading = false;
    }
  }

  async function ensureLoaded() {
    if (loaded && items.length) return items;
    return loadAll();
  }

  function getAll() {
    return items.slice();
  }

  function getByKodorg(kodorg) {
    return byKod.get(n(kodorg)) || null;
  }

  function isFacultyUnit(item) {
    if (!item) return false;
    if (/fakulta/i.test(item.nazev)) return true;
    return /^0[1-9]000$/.test(item.kodorg);
  }

  function isRoot(item) {
    if (!item) return false;
    return item.kodorg === "0" || !item.kodorg_rodic;
  }

  function resolveHierarchy(kodorg) {
    const leaf = getByKodorg(kodorg);
    if (!leaf) return null;
    const chain = [];
    let cur = leaf;
    const seen = new Set();
    while (cur && !seen.has(cur.kodorg) && chain.length < 25) {
      chain.unshift(cur);
      seen.add(cur.kodorg);
      if (isRoot(cur)) break;
      cur = getByKodorg(cur.kodorg_rodic);
    }
    const faculty = chain.find(isFacultyUnit) || null;
    const katedra = leaf && !isFacultyUnit(leaf) ? leaf : null;
    return {
      leaf,
      chain,
      faculty,
      katedra,
      cesta: leaf.cesta || leaf.nazev,
      zkr_fak: inferZkrFak(faculty?.nazev || faculty?.kodorg || "")
    };
  }

  function displayLabel(kodorg, fallback = "") {
    const item = getByKodorg(kodorg);
    if (item) return item.cesta || item.nazev;
    return n(fallback);
  }

  function search(query, limit = 20) {
    const terms = l(query).split(/\s+/).filter((t) => t.length >= 2);
    if (!terms.length) return [];
    return items
      .map((item) => {
        const hay = l(`${item.kodorg} ${item.nazev} ${item.cesta} ${item.nazev_rodic}`);
        let score = 0;
        for (const term of terms) {
          if (item.kodorg === query) score += 20;
          if (l(item.nazev).startsWith(term)) score += 8;
          if (hay.includes(term)) score += 4;
        }
        return { item, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.item.nazev.localeCompare(b.item.nazev, "cs"))
      .slice(0, limit)
      .map((r) => r.item);
  }

  function matchFromText(text) {
    const raw = n(text);
    if (!raw) return null;
    const exact = items.find((item) => l(item.nazev) === l(raw) || l(item.cesta) === l(raw));
    if (exact) return exact;
    const partial = search(raw, 1)[0];
    return partial || null;
  }

  function applyKodorg(record, kodorg, { forMember = false } = {}) {
    const next = { ...record, kodorg: n(kodorg) || "" };
    if (!next.kodorg) return next;
    const h = resolveHierarchy(next.kodorg);
    if (!h) return next;
    const label = h.cesta || h.leaf.nazev;
    if (forMember) {
      next.kmenove_pracoviste = label;
      if (h.faculty) next.fakulta = h.faculty.nazev;
      if (h.zkr_fak) next.zkr_fak = h.zkr_fak;
      if (h.katedra) next.katedra = h.katedra.nazev;
      else if (h.faculty && isFacultyUnit(h.leaf)) next.katedra = "";
    } else {
      next.pracoviste = label;
    }
    return next;
  }

  function applyToPerson(person) {
    if (!person?.kodorg) return person;
    return applyKodorg(person, person.kodorg, { forMember: false });
  }

  function applyToMember(member) {
    if (!member?.kodorg) return member;
    return applyKodorg(member, member.kodorg, { forMember: true });
  }

  window.kbPracoviste = {
    loadAll,
    ensureLoaded,
    getAll,
    getByKodorg,
    resolveHierarchy,
    displayLabel,
    search,
    matchFromText,
    applyKodorg,
    applyToPerson,
    applyToMember,
    inferZkrFak,
    isFacultyUnit,
    probeTables
  };

  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => loadAll().catch(() => {}), 200);
  });
})();
