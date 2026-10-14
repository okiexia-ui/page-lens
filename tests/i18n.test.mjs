import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import "../extension/i18n.js";
import "../extension/reader-core.js";

const { MESSAGES, LANGUAGES, resolveLanguage, translator } = globalThis.PageLensI18n;
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

test("both languages define the same keys with the same placeholders", () => {
  assert.deepEqual(LANGUAGES, ["zh", "en"]);
  assert.deepEqual(Object.keys(MESSAGES.en).sort(), Object.keys(MESSAGES.zh).sort());
  for (const [key, text] of Object.entries(MESSAGES.zh)) {
    assert.ok(text.trim() && MESSAGES.en[key].trim(), `${key} is empty`);
    assert.deepEqual(placeholders(MESSAGES.en[key]), placeholders(text), `${key} placeholders differ`);
  }
  assert.ok(MESSAGES.zh["menu.explain"].includes("%s") && MESSAGES.en["menu.explain"].includes("%s"));
});

test("every key used by the pages, scripts, and runtime codes exists", () => {
  const has = (key) => key in MESSAGES.zh;
  for (const page of ["extension/sidepanel.html", "extension/options.html"]) {
    for (const [, key] of read(page).matchAll(/data-(?:i18n(?:-[\w-]+)?|prompt-key)="([^"]+)"/g)) assert.ok(has(key), `${page} uses missing ${key}`);
  }
  const prefixes = [...new Set(Object.keys(MESSAGES.zh).map((key) => key.split(".")[0]))].join("|");
  const literal = new RegExp(`["'\`]((?:${prefixes})\\.[\\w.]+)["'\`]`, "g");
  for (const script of ["extension/sidepanel.js", "extension/options.js", "extension/background.js", "extension/reader-core.js"]) {
    for (const [, key] of read(script).matchAll(literal)) assert.ok(has(key), `${script} uses missing ${key}`);
  }
  // Keys built at runtime: error codes, generation states, and skill IDs.
  const codes = [...read("extension/sidepanel.js").matchAll(/readerError\("(\w+)"/g), ...read("extension/background.js").matchAll(/readerError\("(\w+)"/g)].map((match) => match[1]);
  for (const code of [...codes, "invalidQuestions", "api", "apiDetail"]) assert.ok(has(`error.${code}`), `missing error.${code}`);
  for (const generation of ["idle", "generating", "failed", "cancelled"]) assert.ok(has(`intro.status.${generation}`));
  for (const skill of globalThis.ReaderCore.SKILLS) assert.ok(has(`skill.${skill}`));
});

test("manifest strings exist in every Chrome locale", () => {
  const manifest = read("extension/manifest.json");
  const names = [...manifest.matchAll(/__MSG_(\w+)__/g)].map((match) => match[1]);
  assert.ok(names.length >= 5);
  for (const locale of ["en", "zh_CN"]) {
    const messages = JSON.parse(read(`extension/_locales/${locale}/messages.json`));
    for (const name of names) assert.ok(messages[name]?.message, `${locale} is missing ${name}`);
  }
});

test("language resolution follows the saved choice, then the browser", () => {
  assert.equal(resolveLanguage("en", "zh-CN"), "en");
  assert.equal(resolveLanguage("zh", "en-US"), "zh");
  assert.equal(resolveLanguage("auto", "zh-TW"), "zh");
  assert.equal(resolveLanguage(undefined, "zh"), "zh");
  assert.equal(resolveLanguage("auto", "en-GB"), "en");
  assert.equal(resolveLanguage("fr", "de-DE"), "en");
});

test("translation fills placeholders and falls back safely", () => {
  const en = translator("en");
  const zh = translator("zh");
  assert.equal(en("progress.position", { current: 2, total: 3, range: "Paragraph 4" }), "Section 2 of 3 · Paragraph 4");
  assert.equal(zh("range.multi", { start: 1, end: 3 }), "第 1–3 段");
  assert.equal(en("feedback.incorrect", {}), "Take another look · The answer is {letter}", "missing params stay visible");
  assert.equal(en("no.such.key"), "no.such.key");
  assert.equal(translator("fr").language, "zh");
  assert.equal(en.has("error.timeout"), true);
  assert.equal(en.has("error.unknown"), false);
});
