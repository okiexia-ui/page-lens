(function () {
  "use strict";

  // Chat models answer in a small Markdown subset. Rendering uses DOM nodes and textContent
  // only, so nothing a model (or a page quoted to it) writes can become HTML or a live link.
  function parseBlocks(text) {
    const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
    const blocks = [];
    let paragraph = [];
    const flush = () => {
      if (paragraph.length) blocks.push({ type: "p", text: paragraph.join("\n") });
      paragraph = [];
    };
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const fence = line.match(/^\s*(```|~~~)/);
      if (fence) {
        flush();
        const code = [];
        while (index + 1 < lines.length && !lines[index + 1].trimStart().startsWith(fence[1])) code.push(lines[++index]);
        index += 1;
        blocks.push({ type: "code", text: code.join("\n") });
        continue;
      }
      if (!line.trim()) { flush(); continue; }
      const last = blocks.at(-1);
      const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
      const item = line.match(/^\s*(?:([-*+])|(\d{1,9})[.)])\s+(.*)$/);
      const quote = line.match(/^\s{0,3}>\s?(.*)$/);
      if (heading) { flush(); blocks.push({ type: "heading", level: heading[1].length, text: heading[2] }); }
      else if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); blocks.push({ type: "hr" }); }
      else if (item) {
        flush();
        const ordered = !item[1];
        if (last?.type === "list" && last.ordered === ordered) last.items.push(item[3]);
        else blocks.push({ type: "list", ordered, start: ordered ? Number(item[2]) : 1, items: [item[3]] });
      } else if (quote) {
        flush();
        if (last?.type === "quote") last.text += `\n${quote[1]}`;
        else blocks.push({ type: "quote", text: quote[1] });
      } else if (!paragraph.length && last?.type === "list" && /^(?: {2,}|\t)/.test(line)) {
        // Indented lines continue the previous list item, e.g. a description under a bold title.
        last.items[last.items.length - 1] += `\n${line.trim()}`;
      } else paragraph.push(line.trim());
    }
    flush();
    return blocks;
  }

  function parseInline(text) {
    const tokens = [];
    let last = 0;
    for (const match of text.matchAll(/`([^`\n]+)`|\*\*(?=\S)([^*\n]+?)\*\*|__(?=\S)([^_\n]+?)__|\*(?=[^*\s])([^*\n]+?)\*/g)) {
      if (match.index > last) tokens.push({ type: "text", text: text.slice(last, match.index) });
      if (match[1] !== undefined) tokens.push({ type: "code", text: match[1] });
      else if (match[4] !== undefined) tokens.push({ type: "em", text: match[4] });
      else tokens.push({ type: "strong", text: match[2] ?? match[3] });
      last = match.index + match[0].length;
    }
    if (last < text.length) tokens.push({ type: "text", text: text.slice(last) });
    return tokens;
  }

  function render(container, text) {
    const doc = container.ownerDocument;
    const inline = (parent, value) => {
      for (const token of parseInline(value)) {
        if (token.type === "text") { parent.append(token.text); continue; }
        const node = doc.createElement(token.type);
        node.textContent = token.text;
        parent.append(node);
      }
      return parent;
    };
    const nodes = parseBlocks(text).map((block) => {
      if (block.type === "hr") return doc.createElement("hr");
      if (block.type === "code") {
        const pre = doc.createElement("pre");
        pre.append(doc.createElement("code"));
        pre.firstChild.textContent = block.text;
        return pre;
      }
      if (block.type === "list") {
        const list = doc.createElement(block.ordered ? "ol" : "ul");
        if (block.ordered && block.start !== 1) list.start = block.start;
        block.items.forEach((item) => list.append(inline(doc.createElement("li"), item)));
        return list;
      }
      const tag = block.type === "heading" ? (block.level <= 2 ? "h3" : "h4") : block.type === "quote" ? "blockquote" : "p";
      return inline(doc.createElement(tag), block.text);
    });
    container.replaceChildren(...nodes);
  }

  globalThis.PageLensMarkdown = Object.freeze({ parseBlocks, parseInline, render });
})();
