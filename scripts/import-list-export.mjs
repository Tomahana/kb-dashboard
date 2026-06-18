#!/usr/bin/env node
/**
 * Import exportu z Microsoft Lists (CSV / JSON / ZIP) do Supabase tabulek kb_records + kb_record_bodies.
 *
 * Příklad:
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/import-list-export.mjs ~/Downloads/vyzkum_18062026100852.zip
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/import-list-export.mjs export.csv --dry-run
 *
 * URL projektu bere z supabase-config.js (nebo SUPABASE_URL).
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const BATCH = 50;

const META_COLUMNS = {
  KB_ID: ["KB_ID", "kb_id", "id", "ID"],
  Title: ["Title", "title", "Předmět", "Predmet", "Subject"],
  "Datum e-mailu": ["Datum e-mailu", "datum_emailu", "Datum emailu", "Date", "Date e-mailu"],
  "Datum přidání": ["Datum přidání", "datum_pridani", "Datum pridani", "Created", "Created at"],
  "Odesílatel": ["Odesílatel", "odesilatel", "From", "Odesilatel"],
  "Agenda": ["Agenda", "agenda"],
  "Typ záznamu": ["Typ záznamu", "typ", "Typ zaznamu", "Content type"],
  "Kam patří": ["Kam patří", "kam_patri", "Kam patri"],
  "Priorita": ["Priorita", "priorita", "Priority"],
  Stav: ["Stav", "stav", "Status"],
  Shrnutí: ["Shrnutí", "shrnuti", "Shrnuti", "Summary"],
  "Navržený bod jednání": ["Navržený bod jednání", "navrzeny_bod", "Navrzeny bod jednani"],
  "Úkol / další krok": ["Úkol / další krok", "ukol_dalsi_krok", "Ukol / dalsi krok"],
  Termín: ["Termín", "termin", "Termin"],
  "Odpovědná osoba": ["Odpovědná osoba", "odpovedna_osoba", "Odpovedna osoba"],
  "Odkaz na e-mail": ["Odkaz na e-mail", "odkaz_na_email", "Odkaz na email", "Link"],
  Poznámka: ["Poznámka", "poznamka", "Poznamka", "Note"],
  KB_SYNC: ["KB_SYNC", "kb_sync", "Modified", "Modified at"]
};

const BODY_COLUMNS = ["Text", "text", "Tělo", "Telo", "body_text", "Body", "Plný text", "Plny text"];

function usage() {
  console.log(`Použití:
  SUPABASE_SERVICE_ROLE_KEY=<klíč> node scripts/import-list-export.mjs <soubor.csv|json|zip> [--dry-run]

Proměnné:
  SUPABASE_URL          — volitelné, jinak z supabase-config.js
  SUPABASE_SERVICE_ROLE_KEY — povinné (Settings → API → service_role)
`);
}

function readSupabaseUrl() {
  if (process.env.SUPABASE_URL) return process.env.SUPABASE_URL.replace(/\/$/, "");
  const cfgPath = path.join(ROOT, "supabase-config.js");
  const raw = fs.readFileSync(cfgPath, "utf8");
  const m = raw.match(/url:\s*["']([^"']+)["']/);
  if (!m) throw new Error("V supabase-config.js chybí url.");
  return m[1].replace(/\/$/, "");
}

function normalizeKey(key) {
  return String(key || "")
    .replace(/^\uFEFF/, "")
    .trim();
}

function pickField(row, aliases) {
  for (const alias of aliases) {
    if (row[alias] != null && String(row[alias]).trim() !== "") return row[alias];
    const hit = Object.keys(row).find((k) => normalizeKey(k).toLowerCase() === alias.toLowerCase());
    if (hit && row[hit] != null && String(row[hit]).trim() !== "") return row[hit];
  }
  return null;
}

function parseAgenda(value) {
  if (value == null || value === "") return null;
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  const text = String(value).trim();
  if (!text) return null;
  if (text.startsWith("[") && text.endsWith("]")) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v).trim()).filter(Boolean);
    } catch (_) {}
  }
  if (text.includes(";")) return text.split(";").map((s) => s.trim()).filter(Boolean);
  if (text.includes(", ")) return text.split(", ").map((s) => s.trim()).filter(Boolean);
  return [text];
}

function parseUuid(value) {
  const text = String(value || "").trim();
  if (!text) return crypto.randomUUID();
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRe.test(text) ? text : crypto.randomUUID();
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function mapRow(raw) {
  const kbId = parseUuid(pickField(raw, META_COLUMNS.KB_ID));
  const meta = { KB_ID: kbId };
  for (const [target, aliases] of Object.entries(META_COLUMNS)) {
    if (target === "KB_ID") continue;
    const value = pickField(raw, aliases);
    if (value == null || value === "") continue;
    if (target === "Agenda") meta[target] = parseAgenda(value);
    else if (target === "Datum e-mailu" || target === "Datum přidání" || target === "KB_SYNC") {
      meta[target] = parseDate(value);
    } else meta[target] = String(value).trim();
  }
  if (!meta.Title) meta.Title = "Bez názvu";
  if (!meta["Datum přidání"]) meta["Datum přidání"] = new Date().toISOString();
  const body = pickField(raw, BODY_COLUMNS);
  return { meta, body: body != null ? String(body) : "" };
}

function detectDelimiter(line) {
  const semi = (line.match(/;/g) || []).length;
  const comma = (line.match(/,/g) || []).length;
  return semi > comma ? ";" : ",";
}

function parseCsv(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim());
  if (!lines.length) return [];
  const delim = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delim).map(normalizeKey);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], delim);
    if (!cells.some((c) => c.trim())) continue;
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = cells[idx] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line, delim) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && ch === delim) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function readDataFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const raw = fs.readFileSync(filePath, "utf8");
  if (ext === ".json") {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : parsed.value || parsed.items || [];
  }
  return parseCsv(raw);
}

function extractZip(zipPath) {
  const tmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "kb-import-"));
  execFileSync("unzip", ["-o", zipPath, "-d", tmp], { stdio: "pipe" });
  const files = [];
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (/\.(csv|json)$/i.test(name)) files.push(full);
    }
  }
  walk(tmp);
  if (!files.length) throw new Error(`V ZIP ${zipPath} nebyl nalezen CSV ani JSON.`);
  files.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
  return files[0];
}

async function supabaseUpsert(url, serviceKey, table, rows, onConflict) {
  const endpoint = `${url}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify(rows)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${table}: HTTP ${res.status} — ${text}`);
  }
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--dry-run");
  const dryRun = process.argv.includes("--dry-run");
  if (!args.length) {
    usage();
    process.exit(1);
  }

  const input = path.resolve(args[0]);
  if (!fs.existsSync(input)) throw new Error(`Soubor neexistuje: ${input}`);

  let dataPath = input;
  if (input.toLowerCase().endsWith(".zip")) {
    dataPath = extractZip(input);
    console.log(`ZIP rozbalen → ${dataPath}`);
  }

  const rawRows = readDataFile(dataPath);
  const mapped = rawRows.map(mapRow).filter((r) => r.meta.KB_ID);
  if (!mapped.length) throw new Error("Žádné záznamy k importu.");

  console.log(`Nalezeno ${mapped.length} záznamů v ${path.basename(dataPath)}`);
  if (dryRun) {
    console.log("Ukázka prvního záznamu:", JSON.stringify(mapped[0], null, 2));
    return;
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("Chybí SUPABASE_SERVICE_ROLE_KEY.");
  const url = readSupabaseUrl();

  let imported = 0;
  for (let i = 0; i < mapped.length; i += BATCH) {
    const chunk = mapped.slice(i, i + BATCH);
    const metaRows = chunk.map((r) => r.meta);
    const bodyRows = chunk
      .filter((r) => r.body.trim())
      .map((r) => ({ KB_ID: r.meta.KB_ID, body_text: r.body }));

    await supabaseUpsert(url, serviceKey, "kb_records", metaRows, "KB_ID");
    if (bodyRows.length) await supabaseUpsert(url, serviceKey, "kb_record_bodies", bodyRows, "KB_ID");
    imported += chunk.length;
    process.stdout.write(`\rImportováno ${imported}/${mapped.length}`);
  }
  console.log("\nHotovo. V aplikaci se přihlaste a načtěte Supabase.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
