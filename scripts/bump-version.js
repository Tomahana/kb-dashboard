#!/usr/bin/env node
/**
 * Zvýší patch verzi v version.json a synchronizuje index.html (sidebar + ?v= cache).
 * Použití: node scripts/bump-version.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const versionPath = path.join(ROOT, "version.json");
const indexPath = path.join(ROOT, "index.html");

function readVersion() {
  const data = JSON.parse(fs.readFileSync(versionPath, "utf8"));
  if (!data.version) throw new Error("version.json musí obsahovat pole version.");
  return data;
}

function nextVersion(current) {
  const parts = String(current).trim().split(".").map((n) => Number(n) || 0);
  if (parts.length <= 2) {
    while (parts.length < 2) parts.push(0);
    parts[1] += 1;
    return parts.slice(0, 2).join(".");
  }
  parts[parts.length - 1] += 1;
  return parts.join(".");
}

const data = readVersion();
const newVersion = nextVersion(data.version);
const bumpedAt = new Date().toISOString().slice(0, 10);

fs.writeFileSync(
  versionPath,
  JSON.stringify({ version: newVersion, bumpedAt }, null, 2) + "\n"
);

let html = fs.readFileSync(indexPath, "utf8");
html = html.replace(
  /(<p class="appVersion" id="appVersion">)Verze [^<]+(<\/p>)/,
  `$1Verze ${newVersion}$2`
);
html = html.replace(/\?v=[^"']+/g, `?v=${newVersion}`);
fs.writeFileSync(indexPath, html);

console.log(`Verze ${data.version} → ${newVersion} (${bumpedAt})`);
