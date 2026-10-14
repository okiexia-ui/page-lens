import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const background = readFileSync(new URL("../extension/background.js", import.meta.url), "utf8");
const i18n = readFileSync(new URL("../extension/i18n.js", import.meta.url), "utf8");

// A small DOM fixture keeps these tests dependency-free. It deliberately has no
// innerText: reading a detached clone must not be needed to find paragraphs.
function element(tagName, children = [], attributes = {}, style = {}) {
  const node = {
    nodeType: 1,
    tagName: tagName.toUpperCase(),
    style,
    attributes,
    childNodes: children.map((child) => typeof child === "string"
      ? { nodeType: 3, nodeValue: child }
      : child),
    parentElement: null,
    matches(selectors) {
      return selectors.split(",").some((selector) => {
        selector = selector.trim();
        const attribute = selector.match(/^\[([^=\]]+)(?:='([^']*)')?\]$/);
        return attribute
          ? Object.hasOwn(attributes, attribute[1]) &&
            (attribute[2] === undefined || attributes[attribute[1]] === attribute[2])
          : tagName.toLowerCase() === selector.toLowerCase();
      });
    }
  };
  for (const child of node.childNodes) child.parentElement = node;
  return node;
}

function environment(body, options = {}) {
  const calls = { query: [], get: [], execute: [], open: [], session: [], menus: [], menuUpdates: [] };
  const local = { ...(options.local || {}) };
  const listeners = {};
  const activeTab = options.activeTab || { id: 41, url: "https://example.com/article", favIconUrl: "https://example.com/icon.png" };
  const sourceTab = options.sourceTab || { id: 12, url: "https://example.com/source" };
  let listener;
  function descendants(node) {
    return node ? [node, ...node.childNodes.filter((child) => child.nodeType === 1).flatMap(descendants)] : [];
  }
  const document = {
    body,
    title: "A short reading",
    documentElement: { lang: "en" },
    querySelectorAll(selector) {
      return descendants(body).filter((node) => node.matches(selector));
    },
    querySelector(selector) {
      if (selector === "meta[name='description']") return { content: " A useful description " };
      if (selector === "link[rel='canonical']") return { href: "https://example.com/canonical" };
      return null;
    }
  };
  const context = vm.createContext({
    document,
    location: { href: activeTab.url },
    Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
    URL,
    getComputedStyle(node) {
      return { display: "block", visibility: "visible", ...node.style };
    },
    getSelection: () => options.selection ?? "",
    navigator: { language: options.browserLanguage || "zh-CN" },
    chrome: {
      sidePanel: {
        async setPanelBehavior() {},
        open(details) { calls.open.push(details); return Promise.resolve(); }
      },
      contextMenus: {
        removeAll(callback) { callback(); },
        create(details) { calls.menus.push(details); },
        update(id, details) { calls.menuUpdates.push({ id, ...details }); return Promise.resolve(); },
        onClicked: { addListener(callback) { listeners.menu = callback; } }
      },
      commands: { onCommand: { addListener(callback) { listeners.command = callback; } } },
      storage: {
        session: { async set(values) { calls.session.push(values); } },
        local: { async get(key) { return key in local ? { [key]: local[key] } : {}; } },
        onChanged: { addListener(callback) { listeners.storage = callback; } }
      },
      runtime: {
        onInstalled: { addListener(callback) { listeners.installed = callback; } },
        onStartup: { addListener() {} },
        onMessage: { addListener(callback) { listener = callback; } }
      },
      tabs: {
        async query(query) { calls.query.push(query); return [activeTab]; },
        async get(tabId) { calls.get.push(tabId); return sourceTab; }
      },
      scripting: {
        async executeScript(request) {
          calls.execute.push(request);
          return [{ result: request.func() }];
        }
      }
    }
  });
  context.importScripts = (file) => {
    assert.equal(file, "i18n.js");
    vm.runInContext(i18n, context);
  };
  vm.runInContext(background, context);
  return { context, calls, listener, listeners, local };
}

const first = "A reader remembers an idea more clearly when they pause to explain it in their own words.";
const second = "A question about the author's central claim can reveal a gap that simply rereading would miss.";
const article = element("article", [
  element("h1", ["Read and reflect"]),
  element("div", [
    element("p", ["A reader remembers an idea more clearly when they ", element("em", ["pause"]), " to explain it in their own words."]),
    element("p", [second])
  ]),
  element("nav", ["Previous | Next"]),
  element("p", ["Invisible text"], {}, { display: "none" }),
  element("p", ["Screen reader hidden text"], { "aria-hidden": "true" }),
  element("script", ["script must not appear"])
]);
const body = element("body", [
  element("nav", ["A very long site navigation. ".repeat(100)]),
  element("div", [element("article", ["Hidden article. ".repeat(500)])], {}, { display: "none" }),
  article,
  element("div", ["Unrelated site text. ".repeat(100)])
]);
const { context, calls, listener } = environment(body);
const result = context.extractReadablePage();
assert.equal(result.text, `Read and reflect\n\n${first}\n\n${second}`,
  "Short articles must win over the larger page, preserve paragraph boundaries, and omit hidden or navigation content");
assert.equal(result.title, "A short reading");
assert.equal(result.url, "https://example.com/canonical");
assert.equal(result.language, "en");
assert.equal(result.lang, "en");
assert.equal(result.description, "A useful description");
assert.ok(Number.isFinite(Date.parse(result.capturedAt)));

const main = environment(element("body", [
  element("article", ["A tiny teaser"]),
  element("section", [element("p", [first]), element("p", [second])], { role: "main" }),
  element("footer", ["Copyright"])
]));
assert.equal(main.context.extractReadablePage().text, `${first}\n\n${second}`);

const fallback = environment(element("body", [
  element("div", [element("p", ["One", element("br"), "line"]), element("p", ["Second paragraph."])]),
  element("aside", ["Related stories"])
]));
assert.equal(fallback.context.extractReadablePage().text, "One\nline\n\nSecond paragraph.");
assert.equal(environment(null).context.extractReadablePage(), null);
assert.equal(environment(element("body", [element("p", ["x".repeat(120005)])])).context.extractReadablePage().text.length, 120000);

const active = await context.getPageContext();
assert.equal(active.tabId, 41);
assert.equal(calls.query.length, 1);
assert.equal(calls.get.length, 0);
assert.equal(calls.execute[0].target.tabId, 41);

const response = await new Promise((resolve) => {
  assert.equal(listener({ type: "GET_PAGE_CONTEXT", tabId: 12 }, {}, resolve), true);
});
assert.equal(response.ok, true);
assert.equal(response.context.tabId, 12);
assert.deepEqual(calls.get, [12]);
assert.equal(calls.query.length, 1, "An explicit source tab must not query the active Reader tab");
assert.equal(calls.execute[1].target.tabId, 12);
for (const invalidId of [0, -1, 1.5, "12", null]) {
  await assert.rejects(context.getPageContext(invalidId), (error) => error.code === "invalidTab");
}
assert.equal(listener({ type: "OTHER" }, {}, () => {}), false);

const blocked = environment(body, { activeTab: { id: 3, url: "chrome://extensions" } });
await assert.rejects(blocked.context.getPageContext(), (error) => error.code === "restricted");
assert.equal(blocked.calls.execute.length, 0);
const empty = environment(element("body", [element("nav", ["Menu"])]));
await assert.rejects(empty.context.getPageContext(), (error) => error.code === "noText");
const failure = await new Promise((resolve) => empty.listener({ type: "GET_PAGE_CONTEXT" }, {}, resolve));
assert.equal(failure.ok, false);
assert.equal(failure.code, "noText", "the side panel translates errors by code");

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const plain = (value) => JSON.parse(JSON.stringify(value)); // values created inside the vm realm
const pageTab = { id: 7, windowId: 3, url: "https://example.com/article" };
const selection = environment(body, { selection: "  A selected\n\n sentence.  " });
selection.listeners.installed();
await flush();
assert.deepEqual(plain(selection.calls.menus.map((menu) => menu.contexts)), [["selection"]]);
assert.equal(selection.calls.menus[0].title, "用 Page Lens 解释「%s」", "a Chinese browser gets the Chinese menu");
assert.ok(selection.calls.menus[0].documentUrlPatterns.every((pattern) => !pattern.startsWith("chrome")), "the menu stays off extension pages");

selection.listeners.menu({ menuItemId: "page-lens-explain-selection", selectionText: `${"word ".repeat(600)}` }, pageTab);
assert.deepEqual(plain(selection.calls.open), [{ windowId: 3 }], "the panel must open synchronously, inside the user gesture");
await flush();
const queued = selection.calls.session[0].pendingSelection;
assert.equal(queued.text.length, 2000);
assert.equal(queued.tabId, 7);
assert.equal(queued.windowId, 3);

selection.listeners.command("explain-selection", pageTab);
assert.equal(selection.calls.open.length, 2);
await flush();
assert.equal(selection.calls.execute.at(-1).target.tabId, 7);
assert.equal(selection.calls.session[1].pendingSelection.text, "A selected sentence.");

selection.listeners.command("open-reader", pageTab);
selection.listeners.menu({ menuItemId: "other", selectionText: "x" }, pageTab);
await flush();
assert.equal(selection.calls.open.length, 3);
assert.equal(selection.calls.session.length, 2, "opening the reader or another menu item must not queue text");

const english = environment(body, { browserLanguage: "en-US" });
english.listeners.installed();
await flush();
assert.equal(english.calls.menus[0].title, "Explain “%s” with Page Lens");
const chosen = environment(body, { browserLanguage: "en-US", local: { uiLanguage: "zh" } });
chosen.listeners.installed();
await flush();
assert.equal(chosen.calls.menus[0].title, "用 Page Lens 解释「%s」", "a saved language overrides the browser");
english.listeners.storage({ uiLanguage: { newValue: "zh" } }, "session");
english.listeners.storage({ selectedModel: { newValue: "x" } }, "local");
await flush();
assert.equal(english.calls.menuUpdates.length, 0, "only a language change retitles the menu");
english.local.uiLanguage = "zh";
english.listeners.storage({ uiLanguage: { newValue: "zh" } }, "local");
await flush();
assert.deepEqual(plain(english.calls.menuUpdates), [{ id: "page-lens-explain-selection", title: "用 Page Lens 解释「%s」" }]);

console.log("Reader page-capture and selection checks passed.");
