import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "../extension/i18n.js";
import "../extension/reader-core.js";

// This opt-in browser test uses an existing Playwright installation; no package dependency is added.
const runtime = process.env.PLAYWRIGHT_MODULE || join(homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs");
const { chromium } = await import(pathToFileURL(resolve(runtime)).href);
const extensionDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../extension");
const paragraphs = [
  "When a city grows, the ground often changes from soil to concrete. Rain that once soaked into gardens and fields now runs quickly across roads and roofs. A drain can carry some of that water away, but a heavy storm may send more water into the system than its pipes can hold. The result is not simply a problem of too much rain. It is also a problem of how the city has chosen to make room for water. Understanding that distinction changes the solutions people are willing to consider.",
  "For many years, engineers tried to move rainwater out of cities as quickly as possible. Bigger pipes and deeper channels seemed to offer a straightforward answer. These systems remain useful, especially around essential buildings. Yet sending water downstream faster can transfer a flood from one neighborhood to another. A solution that works for a single street may therefore create trouble elsewhere. Planning for the whole watershed requires asking where the water goes after it leaves the place we can see.",
  "A different approach begins by giving rain somewhere to pause. Rain gardens collect runoff in shallow planted areas, while permeable paving lets water pass into the ground below. Trees intercept rainfall in their leaves and draw moisture through their roots. None of these measures can stop every flood on its own. Together, however, they can reduce the amount of water reaching a drain at the same moment. The purpose is to slow and share the flow instead of forcing every drop toward a pipe immediately.",
  "The benefits of these spaces extend beyond storm protection. A planted street can offer shade during a hot afternoon and provide habitat for birds and insects. Residents may find a small public garden more inviting than an empty paved corner. These additional benefits matter because land in a city is limited and expensive. A project that serves several needs can make a stronger case for public investment, though its success still depends on careful design and regular maintenance by people who understand the local conditions.",
  "Choosing where to build matters as much as choosing what to build. Some neighborhoods face repeated flooding and have few trees or parks, while others already enjoy generous green space. If new projects go only to places with the loudest advocates, investment can widen existing differences. Planners need to combine flood maps with knowledge from local residents. People who travel the same streets every day may know which paths become impassable and which homes receive water long before those details appear in an official report.",
  "A resilient city therefore needs more than a collection of attractive rain gardens. It needs a connected plan that combines pipes, open ground, public spaces, and the experience of its residents. The plan must also be checked after storms so that failures become opportunities to improve. Making room for water is not a promise that flooding will disappear. It is a commitment to reduce avoidable harm while creating places that remain useful and welcoming when the weather is dry. The strongest approach learns from both the landscape and the people living in it."
];
const sourcePage = {
  title: "Why a city needs room for rain",
  url: "https://example.com/reading/room-for-rain",
  tabId: 42,
  text: paragraphs.join("\n\n"),
  description: "A reading on urban design, evidence, and shared public space.",
  language: "en"
};
const readingSections = globalThis.ReaderCore.createSections(globalThis.ReaderCore.splitParagraphs(sourcePage.text));
assert.equal(readingSections.length, 3, "fixture must provide three reading checkpoints");
const questions = readingSections.map((section, index) => ({
  sectionId: section.id,
  skill: ["main_idea", "reasoning", "evidence"][index],
  question: ["作者为什么认为城市内涝不仅仅是雨量的问题？", "雨水花园与透水路面共同发挥作用的关键是什么？", "作者为什么主张让当地居民参与雨水规划？"][index],
  options: [
    ["城市地表和排水方式也会影响雨水去向。", "城市中的降雨总比乡村更大。", "只要扩大排水管道，所有问题都会消失。", "混凝土能够吸收绝大部分雨水。"],
    ["它们让雨水暂时停留，减缓流入排水系统的速度。", "它们可以让所有洪水永远消失。", "它们完全不需要维护。", "它们的唯一价值是美化街道。"],
    ["居民的日常经验能够补充地图和报告中的信息。", "居民可以替代所有专业规划人员。", "只有声音最大的社区才需要投资。", "规划只需要考虑晴天的公共空间。"]
  ][index],
  answerIndex: 0,
  explanation: ["作者把硬化地表与雨水快速汇集联系起来，强调城市的设计选择也会影响洪水风险。", "这些设施共同降低同一时刻进入排水管道的水量，从而分散排水压力。", "作者强调，居民熟悉每天经过的街道，能提供官方资料尚未记录的具体情况。 "][index],
  evidence: section.text.slice(0, section.text.indexOf(".") + 1)
}));
// The mock model answers in whichever language the question prompt asks for.
const englishQuestions = questions.map((question, index) => ({
  ...question,
  question: ["Why does the author say urban flooding is not only about rainfall?", "What makes rain gardens and permeable paving work together?", "Why should local residents help plan for rain?"][index],
  options: [
    ["How a city covers its ground and drains water also shapes where rain goes.", "Cities always receive more rain than the countryside.", "Bigger pipes alone would solve every problem.", "Concrete absorbs most of the rain that falls on it."],
    ["They let rain pause, slowing how fast it reaches the drains.", "They make every flood disappear for good.", "They never need any maintenance.", "Their only value is making streets look nicer."],
    ["Residents' daily experience adds detail that maps and reports miss.", "Residents can replace all professional planners.", "Only the loudest neighborhoods need investment.", "Planning only needs to consider public space on dry days."]
  ][index],
  explanation: ["Hard surfaces speed up runoff, so the city's design choices shape flood risk.", "Together they reduce how much water reaches the pipes at the same moment.", "People who use the streets daily know problems before official reports do."][index]
}));

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname === "/config.local.js") {
      response.writeHead(200, { "Content-Type": "text/javascript" }).end("// Private local config intentionally excluded from tests.\n");
      return;
    }
    const filename = resolve(extensionDirectory, `.${pathname}`);
    if (!filename.startsWith(extensionDirectory + sep)) throw new Error("Invalid path");
    const content = await readFile(filename);
    response.writeHead(200, { "Content-Type": filename.endsWith(".html") ? "text/html" : filename.endsWith(".css") ? "text/css" : "text/javascript" }).end(content);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;

async function openFixture(width, responses = [], search = "?sourceTab=42", locale = "zh-CN") {
  const context = await browser.newContext({ viewport: { width, height: 980 }, reducedMotion: "reduce", locale });
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await context.addInitScript(({ source, origin }) => {
    const stored = {
      baseUrl: "https://proxy.test/v1",
      customApiBaseUrl: "https://reader.test/v1",
      customApiModel: "fixture",
      selectedModel: "custom::fixture",
      maxChars: 60000
    };
    window.__fixtureStored = stored;
    window.__fixtureMessages = [];
    window.__fixtureOpenedTabs = [];
    window.__fixtureDeferPage = false;
    window.__fixtureReleasePage = null;
    window.chrome = {
      storage: {
        local: {
          get: async () => ({ ...stored }),
          set: async (values) => { Object.assign(stored, values); }
        },
        // Backed by the tab's sessionStorage so reading progress survives a reload, like chrome.storage.session.
        session: {
          get: async (keys) => {
            const all = JSON.parse(sessionStorage.getItem("fixtureSession") || "{}");
            if (keys === null || keys === undefined) return all;
            return Object.fromEntries([keys].flat().filter((key) => key in all).map((key) => [key, all[key]]));
          },
          set: async (values) => {
            sessionStorage.setItem("fixtureSession", JSON.stringify({ ...JSON.parse(sessionStorage.getItem("fixtureSession") || "{}"), ...values }));
          },
          remove: async (keys) => {
            const all = JSON.parse(sessionStorage.getItem("fixtureSession") || "{}");
            [keys].flat().forEach((key) => delete all[key]);
            sessionStorage.setItem("fixtureSession", JSON.stringify(all));
          }
        },
        onChanged: { addListener() {} }
      },
      runtime: {
        getURL: (path) => `${origin}/${path}`,
        openOptionsPage: async () => {},
        sendMessage: async (message) => {
          window.__fixtureMessages.push(message);
          if (window.__fixtureDeferPage) await new Promise((resolve) => { window.__fixtureReleasePage = resolve; });
          return { ok: true, context: structuredClone(source) };
        }
      },
      windows: { getCurrent: async () => ({ id: 1 }) },
      tabs: {
        create: async (details) => { window.__fixtureOpenedTabs.push(details); return { id: 43, ...details }; },
        query: async () => [{ id: 42, url: source.url }]
      }
    };
  }, { source: sourcePage, origin });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = request.url();
    if (url.startsWith(origin + "/")) return route.continue();
    if (url.endsWith("/models")) return route.fulfill({ json: { data: [] } });
    if (url === "https://reader.test/v1/chat/completions") {
      const payload = request.postDataJSON();
      requests.push(payload);
      if (payload.stream) {
        if (responses[0] === "hang") { responses.shift(); return new Promise(() => {}); }
        return route.fulfill({
          contentType: "text/event-stream",
          body: `data: ${JSON.stringify({ choices: [{ delta: { content: "文章强调**为雨水留出空间**，" } }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: { content: "并让居民的经验参与规划。\n\n- 减缓水流\n- 共享空间" } }] })}\n\ndata: [DONE]\n\n`
        });
      }
      const next = responses.shift();
      if (next === "hang") return new Promise(() => {});
      if (next === "unavailable") return route.fulfill({ status: 503, json: { error: { message: "Fixture model temporarily unavailable" } } });
      const english = /in English/.test(payload.messages[0].content);
      const content = next === "malformed" ? '{"questions":[]}' : JSON.stringify({ questions: english ? englishQuestions : questions });
      return route.fulfill({ json: { choices: [{ message: { content } }] } });
    }
    errors.push(`Unexpected outbound request: ${url}`);
    return route.abort();
  });
  await page.goto(`${origin}/sidepanel.html${search}`);
  if (search !== null) await page.waitForFunction(() => !document.querySelector("#startReadingButton").disabled);
  return { context, page, errors, requests };
}

async function revealByReading(page) {
  await page.locator("#articleScroll").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event("scroll"));
  });
  await page.locator("#questionCard").waitFor({ state: "visible" });
}

const option = (page, text) => page.locator(".answer-option", { hasText: text });
const visibleText = (page) => page.evaluate(() => {
  const toggle = document.querySelector("#languageButton");
  toggle.hidden = true;
  const text = document.body.innerText;
  toggle.hidden = false;
  return text;
});
const cjk = /[\u3400-\u9fff]/;
// English interface strings long enough that article text will not contain them by chance.
const englishInterface = Object.values(globalThis.PageLensI18n.MESSAGES.en).map((text) => text.split("{")[0].trim()).filter((text) => text.length >= 12 && !cjk.test(text));

async function assertNoOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }));
  assert.ok(dimensions.width <= dimensions.viewport + 1, `${label}: horizontal overflow (${dimensions.width} > ${dimensions.viewport})`);
}

try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
  for (const width of [1280, 380]) {
    const { context, page, errors, requests } = await openFixture(width);
    await assertNoOverflow(page, `${width}px introduction`);
    assert.equal(await page.locator("#articleBody .article-paragraph").count(), paragraphs.length);
    await page.locator("#startReadingButton").click();
    await page.locator("#waitingCard").waitFor({ state: "visible" });
    assert.equal(await page.locator("#nextSectionButton").isVisible(), false, "next section must be gated before an answer");

    for (let index = 0; index < readingSections.length; index += 1) {
      await revealByReading(page);
      assert.match(await page.locator("#questionText").textContent(), new RegExp(questions[index].question));
      assert.equal(await page.locator("#submitAnswerButton").isDisabled(), true);
      assert.equal(await page.locator("#nextSectionButton").isVisible(), false);
      const unlockedParagraphs = await page.locator("#articleBody .article-paragraph:visible").count();
      assert.equal(unlockedParagraphs, readingSections[index].end + 1, "unread sections must remain gated");
      if (width === 1280 && index === 0) {
        await page.locator("#articleScroll").evaluate((element) => element.scrollTo({ top: 0, behavior: "instant" }));
        await page.screenshot({ path: join(tmpdir(), "page-lens-reader-question.png"), fullPage: true });
      }
      const shown = await page.locator(".answer-option").allTextContents();
      assert.deepEqual(shown.map((text) => text.slice(1)).sort(), [...questions[index].options].sort(), "shuffling must keep every option");
      const choice = questions[index].options[index === 0 ? 1 : 0];
      if (width === 380 && index === 1) {
        // Letter shortcuts select an option; Enter on the focused option submits it.
        const letter = String.fromCharCode(97 + shown.findIndex((text) => text.endsWith(choice)));
        await page.keyboard.press(letter);
        assert.equal(await option(page, choice).locator("input").isChecked(), true);
        assert.equal(await page.locator("#submitAnswerButton").isDisabled(), false);
        await page.keyboard.press("Enter");
      } else {
        await option(page, choice).click();
        assert.equal(await page.locator("#submitAnswerButton").isDisabled(), false);
        await page.locator("#submitAnswerButton").click();
      }
      await page.locator("#answerFeedback").waitFor({ state: "visible" });
      assert.equal(await page.locator(index === 0 ? ".answer-option.is-wrong" : ".answer-option.is-correct").count() > 0, true);
      if (index === 0) {
        const answerColors = await page.evaluate(() => [".answer-option.is-wrong", ".answer-option.is-correct"].map((selector) => getComputedStyle(document.querySelector(selector)).backgroundColor));
        assert.notEqual(answerColors[0], answerColors[1], "wrong and correct options need visually distinct feedback");
      }
      assert.equal((await page.locator("#feedbackEvidence").textContent()).trim(), questions[index].evidence);
      assert.ok((await page.locator("#feedbackExplanation").textContent()).includes(questions[index].explanation.trim()));
      await page.locator("#evidenceButton").click();
      await page.locator(".article-paragraph.evidence-highlight").first().waitFor({ state: "visible" });
      assert.equal(await page.locator(".evidence-mark").allTextContents().then((parts) => parts.join(" ")), questions[index].evidence, "only the quoted text is marked");
      await page.waitForFunction(() => {
        const article = document.querySelector("#articleScroll").getBoundingClientRect();
        const evidence = document.querySelector(".article-paragraph.evidence-highlight").getBoundingClientRect();
        return evidence.top >= article.top - 1 && evidence.top < article.bottom - 20;
      });
      await assertNoOverflow(page, `${width}px answered question`);
      if (index === 0) await page.screenshot({ path: join(tmpdir(), `page-lens-reader-${width === 1280 ? "wide" : "narrow"}.png`), fullPage: true });
      if (width === 1280 && index === 0) {
        const generated = requests.length;
        await page.reload();
        await page.locator("#answerFeedback").waitFor({ state: "visible" });
        assert.equal(requests.length, generated, "reopening the reader must reuse the saved questions");
        assert.equal(await page.locator("#readerIntro").isVisible(), false);
        assert.equal(await option(page, choice).locator("input").isChecked(), true, "restored answer keeps the chosen option");
        assert.equal(await page.locator(".answer-option.is-wrong").count(), 1);
        assert.match(await page.locator("#guideDescription").textContent(), /恢复/);
      }
      await page.locator("#nextSectionButton").click();
    }

    await page.locator("#completionCard").waitFor({ state: "visible" });
    assert.equal(await page.locator("#reviewList .review-item").count(), readingSections.length);
    assert.match(await page.locator("#completionSummary").textContent(), /2/);
    const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#exportNotesButton").click()]);
    assert.equal(download.suggestedFilename(), "Why a city needs room for rain · 阅读笔记.md");
    const notes = await readFile(await download.path(), "utf8");
    assert.match(notes, /^# Why a city needs room for rain/);
    assert.match(notes, /答对 2 \/ 3/);
    for (const question of questions) assert.ok(notes.includes(`> ${question.evidence}`), "notes quote every source passage");
    await page.locator("#restartButton").click();
    await page.locator("#completionCard").waitFor({ state: "hidden" });
    await revealByReading(page);
    assert.equal(await page.locator("#answerFeedback").isVisible(), false, "restart must clear prior answer feedback");

    await page.locator("#chatTab").click();
    await page.locator("#promptInput").fill("请用一句话解释核心观点。");
    await page.locator("#sendButton").click();
    await page.waitForFunction(() => document.querySelector("#messages .assistant .bubble")?.textContent.includes("居民的经验"));
    assert.equal(requests.filter((request) => request.stream).length, 1);
    assert.equal(await page.locator("#messages .assistant .bubble strong").textContent(), "为雨水留出空间");
    assert.equal(await page.locator("#messages .assistant .bubble li").count(), 2);
    assert.equal((await page.locator("#messages .assistant .bubble").textContent()).includes("**"), false);
    await assertNoOverflow(page, `${width}px chat`);

    if (width === 1280) {
      await page.locator("#clearButton").click();
      await page.locator("#readerTab").click();
      await page.evaluate(() => { window.__fixtureDeferPage = true; });
      await page.locator("#refreshPageButton").click();
      await page.waitForFunction(() => typeof window.__fixtureReleasePage === "function");
      await page.locator("#chatTab").click();
      const beforeRecapture = requests.length;
      await page.locator("#promptInput").fill("等待读取完成后再发送。");
      await page.locator("#promptInput").press("Enter");
      assert.equal(await page.locator("#sendButton").isDisabled(), true);
      assert.equal(await page.locator("[data-prompt-key]").first().isDisabled(), true);
      await page.locator("[data-prompt-key]").first().dispatchEvent("click");
      await page.evaluate(() => new Promise(requestAnimationFrame));
      assert.equal(requests.length, beforeRecapture, "page recapture must block Enter and quick prompts from sending stale context");
      assert.equal(await page.locator("#promptInput").inputValue(), "等待读取完成后再发送。", "blocked send must preserve the draft");
      await page.evaluate(() => { window.__fixtureDeferPage = false; window.__fixtureReleasePage(); });
      await page.waitForFunction(() => !document.querySelector("#refreshPageButton").disabled);
    }

    const messages = await page.evaluate(() => window.__fixtureMessages);
    assert.ok(messages.some((message) => message.type === "GET_PAGE_CONTEXT" && message.tabId === 42), "expanded reader must request the original source tab");
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`Reader UI flow, evidence, chat, and responsive checks passed at ${width}px.`);
  }

  {
    // A selection queued from a web page is explained once the side panel has read that page.
    const { context, page, errors, requests } = await openFixture(380, [], "");
    await page.evaluate(() => sessionStorage.setItem("fixtureSession", JSON.stringify({
      pendingSelection: { text: "Planning for the whole watershed", tabId: 42, windowId: 1, createdAt: Date.now() }
    })));
    await page.reload();
    await page.locator("#chatView").waitFor({ state: "visible" });
    await page.waitForFunction(() => document.querySelector("#messages .assistant .bubble li"));
    assert.match(await page.locator("#messages .user .bubble").textContent(), /^解释：「Planning for the whole watershed」$/);
    assert.match(requests.at(-1).messages.at(-1).content, /选中内容：\n「Planning for the whole watershed」/);
    assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem("fixtureSession")).pendingSelection), undefined, "a selection is answered once");
    await page.reload();
    await page.waitForFunction(() => !document.querySelector("#startReadingButton").disabled);
    assert.equal(await page.locator("#chatView").isVisible(), false);

    // Selecting text inside the reader offers the same explanation.
    await page.locator("#paragraph-1").evaluate((paragraph) => {
      const range = document.createRange();
      range.setStart(paragraph.firstChild, 0);
      range.setEnd(paragraph.firstChild, 34);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    assert.equal(await page.locator("#explainSelectionButton").isVisible(), false, "no button for a selection scrolled out of view");
    await page.locator("#articleScroll").evaluate((element) => {
      element.scrollTop = document.querySelector("#paragraph-1").offsetTop - element.offsetTop - 80;
    });
    await page.locator("#explainSelectionButton").waitFor({ state: "visible" });
    const placement = await page.evaluate(() => {
      const button = document.querySelector("#explainSelectionButton").getBoundingClientRect();
      const selected = getSelection().getRangeAt(0).getBoundingClientRect();
      return { gap: selected.top - button.bottom, inside: button.left >= 0 && button.right <= innerWidth };
    });
    assert.ok(placement.inside && placement.gap > 0 && placement.gap < 20, `button sits just above the selection (${JSON.stringify(placement)})`);
    await assertNoOverflow(page, "380px selection button");
    await page.locator("#explainSelectionButton").click();
    await page.locator("#chatView").waitFor({ state: "visible" });
    await page.waitForFunction(() => document.querySelector("#messages .user .bubble")?.textContent.includes("For many years, engineers tried to"));
    assert.equal(await page.locator("#explainSelectionButton").isVisible(), false);
    assert.deepEqual(errors, []);
    await context.close();
    console.log("Reader UI selection explanations passed.");
  }

  {
    const responses = ["hang"];
    const { context, page, errors, requests } = await openFixture(1280, responses);
    await page.locator("#startReadingButton").click();
    await page.locator("#cancelGenerationButton").click();
    await page.waitForFunction(() => !document.querySelector("#startReadingButton").disabled);
    assert.equal(await page.locator("#cancelGenerationButton").isVisible(), false);
    assert.equal(await page.locator("#notice").isVisible(), false, "a deliberate cancel is not an error");
    assert.match(await page.locator("#generationStatus").textContent(), /已取消/);
    await page.locator("#startReadingButton").click();
    await page.locator("#waitingCard").waitFor({ state: "visible" });
    assert.equal(requests.length, 2);
    await page.locator("#articleScroll").evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await page.locator("#questionCard").waitFor({ state: "visible" });

    responses.push("hang");
    await page.locator("#chatTab").click();
    await page.locator("#promptInput").fill("这个问题会被停止。");
    await page.locator("#sendButton").click();
    await page.waitForFunction(() => document.querySelector("#sendButton").classList.contains("stop"));
    assert.equal(await page.locator("#sendButton").getAttribute("aria-label"), "停止生成");
    await page.locator("#sendButton").click();
    await page.waitForFunction(() => document.querySelector("#messages .assistant .bubble")?.textContent === "已停止生成。");
    assert.equal(await page.locator("#sendButton").getAttribute("aria-label"), "发送");
    await page.locator("#promptInput").fill("重新提问。");
    await page.locator("#sendButton").click();
    await page.waitForFunction(() => document.querySelectorAll("#messages .assistant .bubble li").length === 2);
    assert.deepEqual(requests.at(-1).messages.map((message) => message.role), ["system", "user"], "a stopped empty reply must not leave a dangling question");
    assert.deepEqual(errors, []);
    await context.close();
    console.log("Reader UI cancel passed for question generation and chat.");
  }

  {
    // An English browser gets an English interface, English questions, and a live switch to Chinese.
    const { context, page, errors, requests } = await openFixture(380, [], "?sourceTab=42", "en-US");
    assert.equal(await page.evaluate(() => document.documentElement.lang), "en");
    assert.equal(await page.locator("#startReadingButton").textContent(), "Start guided reading →");
    assert.doesNotMatch(await visibleText(page), cjk, "no Chinese interface text in English mode");
    await page.locator("#startReadingButton").click();
    await page.locator("#waitingCard").waitFor({ state: "visible" });
    assert.match(requests[0].messages[0].content, /Write the question, the four options, and the explanation in English/);
    await revealByReading(page);
    assert.equal(await page.locator("#questionSkill").textContent(), "Main idea");
    assert.match(await page.locator("#questionRange").textContent(), /^Paragraphs 1–2 · Pick the option/);
    await option(page, englishQuestions[0].options[1]).click();
    await page.locator("#submitAnswerButton").click();
    assert.match(await page.locator("#feedbackTitle").textContent(), /^Take another look · The answer is [A-D]$/);
    assert.doesNotMatch(await visibleText(page), cjk, "answered question stays fully English");
    await assertNoOverflow(page, "380px English answered question");

    await page.locator("#languageButton").click();
    assert.equal(await page.evaluate(() => document.documentElement.lang), "zh-CN");
    assert.equal(await page.evaluate(() => window.__fixtureStored.uiLanguage), "zh", "the choice is saved");
    assert.equal(await page.locator("#languageButton").textContent(), "EN");
    assert.equal(await page.locator("#questionSkill").textContent(), "主旨理解", "saved questions re-label their skill");
    assert.match(await page.locator("#feedbackTitle").textContent(), /^再看一眼这个观点 · 正确答案 [A-D]$/);
    assert.match(await page.locator("#readingPosition").textContent(), /^第 1 \/ 3 节 · 第 1–2 段$/);
    assert.equal(await page.locator("#nextSectionButton").textContent(), "继续阅读下一节 →");
    assert.equal(await option(page, englishQuestions[0].options[1]).locator("input").isChecked(), true, "switching keeps the answer");
    const chinese = await visibleText(page);
    for (const text of englishInterface) assert.ok(!chinese.includes(text), `English left behind after switching: "${text}"`);
    await page.locator("#languageButton").click();
    assert.doesNotMatch(await visibleText(page), cjk, "switching back restores a fully English interface");

    await page.goto(`${origin}/options.html`);
    assert.equal(await page.locator("h1").textContent(), "Page Lens Settings");
    assert.equal(await page.locator("#uiLanguage").inputValue(), "auto");
    await page.locator("#uiLanguage").selectOption("zh");
    assert.equal(await page.locator("h1").textContent(), "Page Lens 设置");
    assert.equal(await page.locator("#saveButton").textContent(), "保存设置");
    assert.equal(await page.evaluate(() => window.__fixtureStored.uiLanguage), "zh");
    assert.deepEqual(errors, []);
    await context.close();
    console.log("Reader UI language checks passed in English and after switching to Chinese.");
  }

  for (const failure of ["malformed", "unavailable"]) {
    const { context, page, errors, requests } = await openFixture(1280, [failure]);
    await page.locator("#startReadingButton").click();
    await page.locator("#notice").waitFor({ state: "visible" });
    await page.waitForFunction(() => !document.querySelector("#startReadingButton").disabled);
    assert.equal(await page.locator("#questionCard").isVisible(), false, "failed generation must not fabricate a question");
    await page.locator("#startReadingButton").click();
    await page.locator("#waitingCard").waitFor({ state: "visible" });
    await revealByReading(page);
    assert.equal(requests.length, 2, "retry must issue a fresh generation request");
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`Reader UI recovery passed for ${failure} API response.`);
  }
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
