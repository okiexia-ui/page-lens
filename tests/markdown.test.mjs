import assert from "node:assert/strict";
import test from "node:test";
import "../extension/markdown.js";

const { parseBlocks, parseInline } = globalThis.PageLensMarkdown;

test("blocks cover the Markdown subset chat models use", () => {
  const blocks = parseBlocks([
    "## 核心观点",
    "作者认为城市需要**为雨水留出空间**。",
    "第二行仍在同一段。",
    "",
    "1. **硬化地表**",
    "   雨水无法渗透。",
    "2. 排水管道有限",
    "",
    "- 甲",
    "* 乙",
    "> 原文引用",
    "> 第二行",
    "---",
    "```js",
    "const a = 1;",
    "",
    "```",
    "结尾"
  ].join("\n"));
  assert.deepEqual(blocks, [
    { type: "heading", level: 2, text: "核心观点" },
    { type: "p", text: "作者认为城市需要**为雨水留出空间**。\n第二行仍在同一段。" },
    { type: "list", ordered: true, start: 1, items: ["**硬化地表**\n雨水无法渗透。", "排水管道有限"] },
    { type: "list", ordered: false, start: 1, items: ["甲", "乙"] },
    { type: "quote", text: "原文引用\n第二行" },
    { type: "hr" },
    { type: "code", text: "const a = 1;\n" },
    { type: "p", text: "结尾" }
  ]);
});

test("an unterminated code fence keeps streaming text inside the code block", () => {
  assert.deepEqual(parseBlocks("前言\n```\nline one\nline two"), [
    { type: "p", text: "前言" },
    { type: "code", text: "line one\nline two" }
  ]);
  assert.deepEqual(parseBlocks(""), []);
});

test("inline markup is tokenized without interpreting HTML or stray asterisks", () => {
  assert.deepEqual(parseInline("用 `fetch()` 发送 **请求** 与 *流*，2 * 3 * 4 <b>不变</b>"), [
    { type: "text", text: "用 " },
    { type: "code", text: "fetch()" },
    { type: "text", text: " 发送 " },
    { type: "strong", text: "请求" },
    { type: "text", text: " 与 " },
    { type: "em", text: "流" },
    { type: "text", text: "，2 * 3 * 4 <b>不变</b>" }
  ]);
  assert.deepEqual(parseInline("__粗体__"), [{ type: "strong", text: "粗体" }]);
});
