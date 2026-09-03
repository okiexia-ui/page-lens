import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const javascriptFiles = [
  "extension/config.js",
  "extension/background.js",
  "extension/sidepanel.js",
  "extension/options.js"
];

for (const file of javascriptFiles) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  assert.equal(result.status, 0, `${file} has invalid JavaScript:\n${result.stderr}`);
}
const manifest = JSON.parse(readFileSync("extension/manifest.json", "utf8"));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.version, "0.2.0");
assert.ok(manifest.permissions.includes("sidePanel"));
assert.ok(manifest.host_permissions.includes("http://*/*"));
assert.ok(manifest.host_permissions.includes("https://*/*"));

checkReferencedIds("extension/sidepanel.html", "extension/sidepanel.js");
checkReferencedIds("extension/options.html", "extension/options.js");

const sidepanelHtml = readFileSync("extension/sidepanel.html", "utf8");
const optionsHtml = readFileSync("extension/options.html", "utf8");
assert.match(sidepanelHtml, /data-provider="custom"/);
assert.match(optionsHtml, /id="customApiBaseUrl"/);
assert.match(optionsHtml, /id="customApiKey"/);
assert.match(optionsHtml, /id="customApiModel"/);

console.log("Page Lens smoke checks passed.");

function checkReferencedIds(htmlPath, jsPath) {
  const html = readFileSync(htmlPath, "utf8");
  const javascript = readFileSync(jsPath, "utf8");
  const htmlIds = new Set(Array.from(html.matchAll(/\bid="([^"]+)"/g), (match) => match[1]));
  const referencedIds = Array.from(javascript.matchAll(/querySelector\("#([^"]+)"\)/g), (match) => match[1]);
  for (const id of referencedIds) assert.ok(htmlIds.has(id), `${jsPath} references missing #${id} in ${htmlPath}`);
}
