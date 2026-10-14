# Page Lens Reader

[中文](README.md) · **English**

**Turn any web page into a reader that makes you think as you read.** Read an article section by section in Chrome's side panel, answer one comprehension question at the end of each section, check every answer against the original text, and export your reading notes when you finish. Works with GPT / Kimi subscriptions through a local CLIProxyAPI, or with any OpenAI-compatible API.

> The interface and the generated questions are currently in Chinese. Articles stay in their original language.

![Wide reader view: the supporting quote is highlighted in the article on the left; the section's question and explanation are on the right](docs/reader.png)

<p align="center">
  <img src="docs/sidepanel.png" width="320" alt="A comprehension question in the side panel">
  &nbsp;&nbsp;
  <img src="docs/chat.png" width="320" alt="Article chat in the side panel, with the reply formatted as Markdown">
</p>

## Why

Most "AI sidebars" help you **skip** reading: summarize in one click, forget a minute later. Page Lens does the opposite and helps you **actually finish** an article:

- Pause at the end of each section and check whether you caught the author's claim, reasoning, and evidence.
- Every answer must be backed by a verbatim quote from the article; quotes the model invents are rejected.
- Picked the wrong answer? One click takes you back to the exact sentence.

It works especially well for long English articles, opinion pieces, and research write-ups, and for students and language learners practicing reading comprehension.

## Features

| | |
|---|---|
| **Guided reading** | Splits the article into 1–5 sections with one multiple-choice question each (main idea, cause and effect, or evidence). A question appears only when you reach the end of a section, and the next section unlocks once you answer. |
| **Quotes as proof** | Every explanation comes with a verbatim quote that is checked against the section when the questions are generated. **在正文中定位** (locate in text) marks that exact sentence in the article. |
| **Explain a selection** | Select text on any page and right-click **用 Page Lens 解释** (explain with Page Lens), or press `Alt+Shift+E`. Inside the reader, selecting text shows an **解释选中** (explain selection) button. |
| **Reading notes** | When you finish, export Markdown notes with each question, your choice, the explanation, and the source quote, ready for Obsidian or Notion. |
| **Article chat** | Ask follow-up questions about the whole article. Replies render Markdown and can be stopped at any time. |
| **Saved progress** | Close and reopen the side panel and your questions and progress are still there, with no extra API calls. Cleared when Chrome quits. |
| **No "always A"** | Options are shuffled so the answer's position gives nothing away. |

## Install

1. Download the latest `page-lens-reader-v*.zip` from [Releases](https://github.com/okiexia-ui/page-lens/releases) and unzip it (or clone this repository and use its `extension` folder).
2. Open `chrome://extensions` and turn on **Developer mode** in the top-right corner.
3. Click **Load unpacked** and choose the unzipped folder.
4. Pin **Page Lens Reader** to the toolbar, open any article, then click the icon or press `Alt+Shift+L`.

Requires Chrome 116 or later.

## Connect a model

Open settings with the ⚙ button in the side panel and choose either option.

### Option 1: Custom API (simplest)

Under **自定义 OpenAI 兼容 API** (custom OpenAI-compatible API), enter the Base URL, API key, and model name. Save, then choose **自定义 API** under **阅读模型** (reading model) in the side panel. Any service that implements `POST /chat/completions` works, for example:

| Service | Base URL |
|---|---|
| OpenAI | `https://api.openai.com/v1` |
| DeepSeek | `https://api.deepseek.com/v1` |
| Moonshot (Kimi) | `https://api.moonshot.cn/v1` |
| OpenRouter | `https://openrouter.ai/api/v1` |

**测试并获取模型** (test and fetch models) lists the available models; for services without a `/models` endpoint, type the model name yourself. Both streaming and non-streaming responses are supported.

### Option 2: GPT / Kimi subscriptions (advanced)

Run [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) on your machine to expose your Codex / ChatGPT and Kimi Code subscription logins as a local OpenAI-compatible endpoint:

```text
Chrome side panel -> http://127.0.0.1:8317/v1 -> CLIProxyAPI -> Codex OAuth / Kimi OAuth
```

The proxy listens only on `127.0.0.1` and its management API is disabled. OAuth credentials stay in `~/.cli-proxy-api`; the extension holds only a separate local client key. After configuring it from [`proxy/config.example.yaml`](proxy/config.example.yaml):

```bash
cliproxyapi -config ~/.cli-proxy-api/config.yaml -codex-login
cliproxyapi -config ~/.cli-proxy-api/config.yaml -kimi-login
```

To start it at login, create a launchd service from [`proxy/com.local.pagelens.cliproxyapi.plist.template`](proxy/com.local.pagelens.cliproxyapi.plist.template):

```bash
launchctl kickstart -k gui/$(id -u)/com.local.pagelens.cliproxyapi
```

Then enter the local client key under **GPT / Kimi 订阅代理** (subscription proxy) in settings. You can also copy `extension/config.local.example.js` to `extension/config.local.js` for local defaults; that file is excluded by `.gitignore`. Check each service's terms before using a subscription account this way.

## Usage

1. Open an article, then open the side panel. The text appears in the reader right away.
2. Click **开始引导阅读** (start guided reading) to generate questions. If it is slow, click **取消生成** (cancel).
3. Scroll to the end of a section and its question appears. Press **A–D** to choose and **Enter** to submit, or click.
4. Read the explanation and quote, click **在正文中定位** to jump to the source, then continue to the next section.
5. When you finish, **导出阅读笔记** (export notes), **再读一遍** (read again), or **换一组问题** (new questions).

If the side panel feels narrow, **↗** opens a wide reader in a new tab (keep the original page open). **Aa** changes the text size, and **重新读取** (reload) captures the page again.

### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Alt+Shift+L` | Open the reader side panel |
| `Alt+Shift+E` | Explain the text selected on the page |
| `A`–`D` / `1`–`4`, `Enter` | Choose and submit an answer |

Change them at `chrome://extensions/shortcuts`.

## Privacy

- Nothing is scanned in the background. The page is read only when you open the side panel, click reload, or ask for a selection to be explained.
- **Start guided reading** sends the article once to generate questions. Answering, checking quotes, rereading, and resuming saved progress all happen locally. **New questions** and article chat send the article again. By default at most 60,000 characters per page are sent; lower the limit in settings to save quota.
- With a custom API, the article goes directly to the Base URL you configured. Review that provider's privacy policy first.
- Custom API keys are stored in `chrome.storage.local`, never in the repository. Generated questions, quotes, and your answers (for the 20 most recent articles) live only in Chrome's in-memory session storage and are cleared when Chrome quits.
- Browser pages such as `chrome://` cannot be read by extensions.

## Development

No dependencies to install:

```bash
npm test
```

Runs syntax, question parsing, Markdown rendering, page capture, and selection hand-off checks.

```bash
npm run test:ui
```

Runs the full reading flow in Chromium against mocked articles and model responses; nothing is sent to a real model. Requires Playwright: set `PLAYWRIGHT_MODULE` to the Playwright module, and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to a browser if needed.

```bash
npm run package
```

Builds `dist/page-lens-reader-v<version>.zip`. Its `config.local.js` is empty, so no local key is included.

After changing code, click **Reload** on the extension card in `chrome://extensions`.

## License

[MIT](LICENSE)
