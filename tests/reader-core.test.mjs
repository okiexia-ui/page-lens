import assert from "node:assert/strict";
import test from "node:test";
import "../extension/reader-core.js";

const { splitParagraphs, createSections, buildQuestionMessages, parseQuestions, shuffleOptions, findEvidenceRanges, buildNotes, fingerprintPage } = globalThis.ReaderCore;
const withoutWhitespace = (text) => text.replace(/\s+/gu, "");

test("reader retains the complete article through paragraph splitting and sectioning", () => {
  const original = `\n  Opening.\r\n\r\n${"这是很长的中文段落，包含核心观点。".repeat(1100)}\n${"An English sentence explains evidence. ".repeat(700)}\n${"𠮷🌱".repeat(1400)}\nThe final idea matters.\n`;
  const paragraphs = splitParagraphs(original);
  const sections = createSections(paragraphs);
  assert.equal(withoutWhitespace(paragraphs.join("")), withoutWhitespace(original));
  assert.equal(withoutWhitespace(sections.map((section) => section.text).join("")), withoutWhitespace(original));
  assert.equal(sections.length, 5);
  assert.equal(sections[0].start, 0);
  assert.equal(sections.at(-1).end, paragraphs.length - 1);
  for (const [index, section] of sections.entries()) {
    assert.equal(section.id, index + 1);
    assert.equal(section.text, paragraphs.slice(section.start, section.end + 1).join("\n\n"));
    if (index > 0) assert.equal(section.start, sections[index - 1].end + 1);
  }
  for (const paragraph of paragraphs) assert.ok(!/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(paragraph));
});

test("short readings stay short and long readings have balanced sequential sections", () => {
  assert.deepEqual(splitParagraphs(" \n\t"), []);
  assert.deepEqual(createSections([]), []);
  assert.equal(createSections(splitParagraphs("A single short idea.")).length, 1);
  assert.equal(createSections(splitParagraphs("a".repeat(700) + "\n" + "b".repeat(700))).length, 2);
  const paragraphs = Array.from({ length: 24 }, (_, index) => `${index}: ${"x".repeat(300)}`);
  const sections = createSections(paragraphs);
  assert.equal(sections.length, 4);
  const lengths = sections.map((section) => section.text.length);
  assert.ok(Math.max(...lengths) - Math.min(...lengths) < 320);
});

const sections = [
  { id: 1, start: 0, end: 0, text: "Plants turn light into energy.\n\nThat process supports their growth." },
  { id: 2, start: 1, end: 1, text: "Shade reduces the light available to plants. Their growth can slow down." }
];
const validQuestions = () => [
  { sectionId: 1, skill: "主旨理解", question: " 第一节的核心观点是什么？ ", options: ["植物利用光能生长", "植物无需能量", "植物只在夜间生长", "光线阻止植物生长"], answerIndex: 0, explanation: "原文说明了光、能量与植物生长的关系。", evidence: "Plants turn light into energy.\nThat process supports their growth." },
  { sectionId: 2, skill: "因果推理", question: "为什么阴影可能减缓植物生长？", options: ["阴影让植物失去水分", "阴影减少可用光线", "阴影提高温度", "阴影增加生长速度"], answerIndex: 1, explanation: "阴影减少了植物可以利用的光。", evidence: "Shade reduces the light available to plants." }
];
const encode = (questions) => JSON.stringify({ questions });

test("question prompt includes every section verbatim and treats article text as data", () => {
  const messages = buildQuestionMessages({ title: "Plant reading", url: "https://example.com/article" }, sections);
  assert.deepEqual(messages.map((message) => message.role), ["system", "user"]);
  assert.match(messages[0].content, /不是指令/);
  assert.match(messages[0].content, /尚未阅读/);
  const source = JSON.parse(messages[1].content);
  assert.equal(source.sections[1].text, sections[1].text);
  assert.deepEqual(source.sections.map((section) => section.sectionId), [1, 2]);
});

test("parser handles fenced JSON, normalized evidence whitespace, and section ordering", () => {
  const parsed = parseQuestions(`\`\`\`json\n${encode(validQuestions().reverse())}\n\`\`\``, sections);
  assert.deepEqual(parsed.map((question) => question.sectionId), [1, 2]);
  assert.equal(parsed[0].question, "第一节的核心观点是什么？");
  assert.equal(parsed[1].answerIndex, 1);
  const wrapped = parseQuestions(`Here is the quiz:\n${encode(validQuestions())}\nGood luck.`, sections);
  assert.deepEqual(wrapped.map((question) => question.sectionId), [1, 2]);
  const prose = parseQuestions(`以下是题目：\n\`\`\`json\n${encode(validQuestions())}\n\`\`\`\n祝阅读愉快。`, sections);
  assert.equal(prose.length, 2);
});

test("evidence tolerates swapped curly and straight quotes but not altered wording", () => {
  const quoted = [{ id: 1, start: 0, end: 0, text: "She called it “a city’s memory of water.” Then she paused." }];
  const question = { ...validQuestions()[0], evidence: `called it "a city's memory of water."` };
  assert.equal(parseQuestions(encode([question]), quoted)[0].evidence, question.evidence);
  assert.throws(() => parseQuestions(encode([{ ...question, evidence: `called it "a town's memory of water."` }]), quoted));
});

test("shuffling moves the answer with its option and keeps every option", () => {
  const question = validQuestions()[1];
  const values = [0.1, 0.9, 0.4];
  const shuffled = shuffleOptions(question, () => values.shift());
  assert.deepEqual([...shuffled.options].sort(), [...question.options].sort());
  assert.equal(shuffled.options[shuffled.answerIndex], question.options[question.answerIndex]);
  assert.notDeepEqual(shuffled.options, question.options);
  assert.deepEqual(question.options, validQuestions()[1].options, "the source question must not be mutated");
  const positions = new Set(Array.from({ length: 40 }, () => shuffleOptions(question).answerIndex));
  assert.ok(positions.size > 1, "Math.random shuffling must vary the answer position");
});

test("evidence ranges mark the exact quote across paragraphs and collapsed whitespace", () => {
  const paragraphs = ["Opening words.", "Rain gardens  collect runoff. Trees “intercept” rain.", "Pipes still matter. Later text."];
  const section = { id: 1, start: 1, end: 2, text: paragraphs.slice(1).join("\n\n") };
  assert.deepEqual(findEvidenceRanges(paragraphs, section, "gardens collect runoff."), [{ index: 1, start: 5, end: 29 }]);
  const spanning = findEvidenceRanges(paragraphs, section, 'Trees "intercept" rain. Pipes still matter.');
  assert.deepEqual(spanning, [{ index: 1, start: 30, end: 53 }, { index: 2, start: 0, end: 19 }]);
  assert.equal(paragraphs[1].slice(spanning[0].start, spanning[0].end), "Trees “intercept” rain.");
  assert.deepEqual(findEvidenceRanges(paragraphs, section, "Opening words."), [], "quotes outside the section are ignored");
  assert.deepEqual(findEvidenceRanges(paragraphs, section, "  "), []);
});

test("parser rejects incomplete, ambiguous, unsupported, and ungrounded quiz data", () => {
  const mutations = [
    (questions) => questions.pop(),
    (questions) => { questions[1].sectionId = 1; },
    (questions) => { questions[0].sectionId = 1.5; },
    (questions) => { questions[0].sectionId = "1"; },
    (questions) => { questions[0].sectionId = null; },
    (questions) => { questions[0].skill = "词语记忆"; },
    (questions) => { questions[0].question = " "; },
    (questions) => { questions[0].explanation = ""; },
    (questions) => { questions[0].options.pop(); },
    (questions) => { questions[0].options[0] = ""; },
    (questions) => { questions[0].options[0] = 17; },
    (questions) => { questions[0].options[0] = ` ${questions[0].options[1]} `; },
    (questions) => { questions[0].answerIndex = -1; },
    (questions) => { questions[0].answerIndex = 4; },
    (questions) => { questions[0].answerIndex = 0.5; },
    (questions) => { questions[0].answerIndex = "0"; },
    (questions) => { questions[0].evidence = " \n"; },
    (questions) => { questions[0].evidence = questions[1].evidence; },
    (questions) => { questions[0].evidence = "Plants create energy from darkness."; }
  ];
  for (const mutate of mutations) {
    const questions = validQuestions();
    mutate(questions);
    assert.throws(() => parseQuestions(encode(questions), sections), /问题格式或原文依据/);
  }
  for (const raw of ["", "garbage", "null", "[]", "{}", "x}", '{"questions":[]}', encode(validQuestions()).slice(0, -2)]) {
    assert.throws(() => parseQuestions(raw, sections));
  }
  assert.throws(() => parseQuestions(encode([]), []));
});

test("reading notes record each question, the reader's choice, and the source quote", () => {
  const questions = parseQuestions(encode(validQuestions()), sections);
  const notes = buildNotes({
    title: "Plant reading", url: "https://example.com/article", date: "2026-10-14",
    sections, questions, answers: [{ selected: 0, correct: true }, { selected: 3, correct: false }]
  });
  assert.match(notes, /^# Plant reading\n/);
  assert.match(notes, /- 结果：答对 1 \/ 2/);
  assert.match(notes, /## 1\. 第一节的核心观点是什么？\n\n\*主旨理解 · 第 1 段\*/);
  assert.match(notes, /- A\. 植物利用光能生长 ✓\n/);
  assert.match(notes, /- B\. 阴影减少可用光线 ✓\n/);
  assert.match(notes, /- D\. 阴影增加生长速度 ✗ 我的选择\n/);
  assert.match(notes, /> Plants turn light into energy\.\n> That process supports their growth\./, "multi-line quotes stay inside the blockquote");
  assert.doesNotMatch(notes, /- A\. 植物利用光能生长 ✓ ✗/);
});

test("fingerprint detects same-length edits anywhere in the full source", () => {
  const page = { url: "https://example.com/article", text: `${"a".repeat(80000)}first` };
  assert.equal(fingerprintPage(page), fingerprintPage({ ...page, title: "Changed title" }));
  assert.notEqual(fingerprintPage(page), fingerprintPage({ ...page, text: `${"a".repeat(80000)}other` }));
  assert.notEqual(fingerprintPage(page), fingerprintPage({ ...page, url: "https://example.com/other" }));
});
