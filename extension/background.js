const BLOCKED_PROTOCOLS = new Set([
  "chrome:",
  "chrome-extension:",
  "edge:",
  "about:",
  "devtools:",
  "view-source:"
]);

async function enableActionOpen() {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}
chrome.runtime.onInstalled.addListener(() => {
  enableActionOpen().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  enableActionOpen().catch(() => {});
});

enableActionOpen().catch(() => {});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "GET_PAGE_CONTEXT") return false;

  getPageContext(message.tabId)
    .then((context) => sendResponse({ ok: true, context }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

async function getPageContext(tabId) {
  if (tabId !== undefined && (!Number.isInteger(tabId) || tabId <= 0)) {
    throw new Error("原网页标签无效，请重新打开 Reader");
  }

  const tab = tabId === undefined
    ? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]
    : await chrome.tabs.get(tabId);
  if (!tab?.id || !tab.url) throw new Error("没有找到当前标签页");

  const protocol = new URL(tab.url).protocol;
  if (BLOCKED_PROTOCOLS.has(protocol)) {
    throw new Error("Chrome 系统页面不允许扩展读取，请切换到普通网页");
  }

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractReadablePage
  });

  if (!result?.text) throw new Error("当前页面没有可读取的正文");

  return {
    ...result,
    tabId: tab.id,
    favicon: tab.favIconUrl || ""
  };
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
    title: document.title || "未命名页面",
    url: canonical,
    lang: language,
    language,
    description,
    text,
    capturedAt: new Date().toISOString()
  };
}
