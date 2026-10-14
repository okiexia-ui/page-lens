importScripts("i18n.js");

const BLOCKED_PROTOCOLS = new Set([
  "chrome:",
  "chrome-extension:",
  "edge:",
  "about:",
  "devtools:",
  "view-source:"
]);

const EXPLAIN_MENU_ID = "page-lens-explain-selection";
const MAX_SELECTION_CHARS = 2000;

async function enableActionOpen() {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}
chrome.runtime.onInstalled.addListener(() => {
  enableActionOpen().catch(() => {});
  chrome.contextMenus.removeAll(async () => {
    chrome.contextMenus.create({
      id: EXPLAIN_MENU_ID,
      title: await explainMenuTitle(),
      contexts: ["selection"],
      documentUrlPatterns: ["http://*/*", "https://*/*", "file:///*"]
    });
  });
});

// Keep the menu in the language chosen in the side panel or settings.
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !("uiLanguage" in changes)) return;
  explainMenuTitle().then((title) => chrome.contextMenus.update(EXPLAIN_MENU_ID, { title })).catch(() => {});
});

async function explainMenuTitle() {
  const { uiLanguage } = await chrome.storage.local.get("uiLanguage");
  return PageLensI18n.translator(PageLensI18n.resolveLanguage(uiLanguage, navigator.language))("menu.explain");
}

// sidePanel.open() needs the user gesture, so it is called before any await in these handlers.
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== EXPLAIN_MENU_ID || !tab?.id) return;
  chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  queueSelection(tab, info.selectionText).catch(() => {});
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (!tab?.id || !["open-reader", "explain-selection"].includes(command)) return;
  chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  if (command !== "explain-selection") return;
  chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => String(getSelection() || "") })
    .then(([injection]) => queueSelection(tab, injection?.result))
    .catch(() => {});
});

async function queueSelection(tab, text) {
  const selection = String(text || "").replace(/\s+/g, " ").trim().slice(0, MAX_SELECTION_CHARS);
  if (!selection) return;
  // The side panel in this window picks this up once it has read the page.
  await chrome.storage.session.set({
    pendingSelection: { text: selection, tabId: tab.id, windowId: tab.windowId, createdAt: Date.now() }
  });
}

chrome.runtime.onStartup.addListener(() => {
  enableActionOpen().catch(() => {});
});

enableActionOpen().catch(() => {});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "GET_PAGE_CONTEXT") return false;

  getPageContext(message.tabId)
    .then((context) => sendResponse({ ok: true, context }))
    .catch((error) => sendResponse({ ok: false, error: error.message, code: error.code }));

  return true;
});

async function getPageContext(tabId) {
  if (tabId !== undefined && (!Number.isInteger(tabId) || tabId <= 0)) {
    throw readerError("invalidTab", "The source tab is invalid");
  }

  const tab = tabId === undefined
    ? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]
    : await chrome.tabs.get(tabId);
  if (!tab?.id || !tab.url) throw readerError("noTab", "No current tab");

  const protocol = new URL(tab.url).protocol;
  if (BLOCKED_PROTOCOLS.has(protocol)) {
    throw readerError("restricted", "Browser pages cannot be read");
  }

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractReadablePage
  });

  if (!result?.text) throw readerError("noText", "No readable text");

  return {
    ...result,
    tabId: tab.id,
    favicon: tab.favIconUrl || ""
  };
}

// The side panel shows these codes in the reader's own language.
function readerError(code, message) {
  return Object.assign(new Error(message), { code });
}

function extractReadablePage() {
  const MAX_CAPTURE_CHARS = 120000;
  const excludedSelector = [
    "script",
    "style",
    "noscript",
    "template",
    "svg",
    "canvas",
    "iframe",
    "form",
    "button",
    "input",
    "select",
    "textarea",
    "nav",
    "footer",
    "aside",
    "[role='navigation']",
    "[role='complementary']",
    "[role='contentinfo']",
    "[role='dialog']",
    "[aria-hidden='true']",
    "[hidden]"
  ].join(",");
  const blockTags = new Set([
    "ADDRESS", "ARTICLE", "BLOCKQUOTE", "CAPTION", "DD", "DETAILS", "DIV",
    "DL", "DT", "FIGCAPTION", "FIGURE", "H1", "H2", "H3", "H4", "H5", "H6",
    "HEADER", "HR", "LI", "MAIN", "OL", "P", "PRE", "SECTION", "SUMMARY",
    "TABLE", "TR", "UL"
  ]);

  function isExcluded(node) {
    if (node.matches(excludedSelector)) return true;
    const style = getComputedStyle(node);
    return style.display === "none" || style.visibility === "hidden" ||
      style.visibility === "collapse" || style.contentVisibility === "hidden";
  }

  function readableText(source) {
    // Candidates can live inside a hidden container, even if their own display
    // style is visible. Check ancestors before starting at a nested article.
    for (let node = source; node; node = node.parentElement) {
      if (isExcluded(node)) return "";
    }

    const pieces = [];
    function visit(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        pieces.push(node.nodeValue.replace(/\s+/g, " "));
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE || isExcluded(node)) return;
      if (node.tagName === "BR") {
        pieces.push("\n");
        return;
      }
      const isBlock = blockTags.has(node.tagName);
      if (isBlock) pieces.push("\n\n");
      if (node.tagName === "TD" || node.tagName === "TH") pieces.push(" ");
      for (const child of node.childNodes) visit(child);
      if (isBlock) pieces.push("\n\n");
    }
    visit(source);

    return pieces.join("")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function bestText(selector) {
    return Array.from(document.querySelectorAll(selector))
      .map(readableText)
      .filter((text) => text.length >= 100)
      .sort((a, b) => b.length - a.length)[0];
  }

  if (!document.body) return null;
  const text = (bestText("article") || bestText("main, [role='main']") ||
    readableText(document.body)).slice(0, MAX_CAPTURE_CHARS);

  const description = document.querySelector("meta[name='description']")?.content?.trim() || "";
  const canonical = document.querySelector("link[rel='canonical']")?.href || location.href;
  const language = document.documentElement.lang || "";

  return {
    title: document.title || "",
    url: canonical,
    lang: language,
    language,
    description,
    text,
    capturedAt: new Date().toISOString()
  };
}
