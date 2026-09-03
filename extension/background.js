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

  getPageContext()
    .then((context) => sendResponse({ ok: true, context }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

async function getPageContext() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
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
  const preferred = Array.from(document.querySelectorAll("article, main, [role='main']"))
    .map((node) => ({ node, length: (node.innerText || "").trim().length }))
    .sort((a, b) => b.length - a.length)[0];
  const source = preferred?.length > 800 ? preferred.node : document.body;
  if (!source) return null;

  const clone = source.cloneNode(true);
  clone.querySelectorAll([
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
    "[aria-hidden='true']",
    "[hidden]"
  ].join(",")).forEach((node) => node.remove());

  const text = (clone.innerText || clone.textContent || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_CAPTURE_CHARS);

  const description = document.querySelector("meta[name='description']")?.content?.trim() || "";
  const canonical = document.querySelector("link[rel='canonical']")?.href || location.href;
  const language = document.documentElement.lang || "";

  return {
    title: document.title || "未命名页面",
    url: canonical,
    language,
    description,
    text,
    capturedAt: new Date().toISOString()
  };
}
